CREATE FUNCTION public.event_feed(filters jsonb DEFAULT '{}',page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; local_today date:=(now() AT TIME ZONE 'Asia/Almaty')::date; start_day date; end_day date;
BEGIN
 IF page<0 OR page>100000 THEN RAISE EXCEPTION 'Некорректная страница'; END IF;
 CASE COALESCE(filters->>'date','all')
 WHEN 'today' THEN start_day:=local_today;end_day:=local_today;
 WHEN 'tomorrow' THEN start_day:=local_today+1;end_day:=local_today+1;
 WHEN 'week' THEN start_day:=local_today;end_day:=local_today+6;
 WHEN 'weekend' THEN start_day:=local_today+CASE WHEN extract(isodow FROM local_today)=7 THEN -1 ELSE 6-extract(isodow FROM local_today)::integer END;end_day:=start_day+1;
 WHEN 'custom' THEN start_day:=NULLIF(filters->>'from','')::date;end_day:=NULLIF(filters->>'to','')::date;
 ELSE NULL; END CASE;
 WITH candidates AS (
 SELECT a.*,COALESCE((SELECT avg(v.rating) FROM public.reviews v WHERE v.reviewed_user_id=COALESCE(a.manager_id,a.organizer_id) AND public.is_activity_host(v.activity_id,v.reviewed_user_id)),0) live_rating,
 (SELECT count(*) FROM public.reviews v WHERE v.reviewed_user_id=COALESCE(a.manager_id,a.organizer_id) AND public.is_activity_host(v.activity_id,v.reviewed_user_id)) live_rating_count,
 EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=COALESCE(a.manager_id,a.organizer_id) AND role IN ('sports_manager','tournament_organizer')) host_approved,
 (CASE WHEN a.city=p.city THEN 8 ELSE 0 END+CASE WHEN a.sport=ANY(p.sports) THEN 5 ELSE 0 END+CASE WHEN a.type::text=ANY(pp.event_types) THEN 2 ELSE 0 END+CASE WHEN extract(dow FROM a.date_time AT TIME ZONE 'Asia/Almaty')::integer=ANY(pp.days) THEN 2 ELSE 0 END+CASE WHEN to_char(a.date_time AT TIME ZONE 'Asia/Almaty','HH24:MI') BETWEEN pp.time_from AND pp.time_to THEN 1 ELSE 0 END) relevance,
 EXISTS(SELECT 1 FROM public.saved_events s WHERE s.activity_id=a.id AND s.user_id=auth.uid()) saved
 FROM public.activities a LEFT JOIN public.profiles p ON p.id=auth.uid() LEFT JOIN public.profile_preferences pp ON pp.user_id=p.id
 WHERE NOT a.is_private
 AND (COALESCE(filters->>'city','all')='all' OR a.city=filters->>'city')
 AND (COALESCE(filters->>'district','')='' OR a.district ILIKE '%'||(filters->>'district')||'%')
 AND (COALESCE(filters->>'sport','all')='all' OR a.sport=filters->>'sport')
 AND (COALESCE(filters->>'type','all')='all' OR a.type::text=filters->>'type')
 AND (COALESCE(filters->>'skill','all')='all' OR a.skill_level=filters->>'skill')
 AND (COALESCE(filters->>'venue','all')='all' OR a.venue_type=filters->>'venue')
 AND (COALESCE(filters->>'q','')='' OR concat_ws(' ',a.title,a.location_text,a.sport,a.host_name) ILIKE '%'||(filters->>'q')||'%')
 AND (NOT COALESCE((filters->>'free')::boolean,false) OR a.is_free)
 AND (NULLIF(filters->>'min','') IS NULL OR COALESCE(a.entry_fee,CASE WHEN a.is_free THEN 0 END)>=(filters->>'min')::numeric)
 AND (NULLIF(filters->>'max','') IS NULL OR COALESCE(a.entry_fee,CASE WHEN a.is_free THEN 0 END)<=(filters->>'max')::numeric)
 AND (start_day IS NULL OR (a.date_time AT TIME ZONE 'Asia/Almaty')::date>=start_day)
 AND (end_day IS NULL OR (a.date_time AT TIME ZONE 'Asia/Almaty')::date<=end_day)
 AND (COALESCE(filters->>'time_from','')='' OR to_char(a.date_time AT TIME ZONE 'Asia/Almaty','HH24:MI')>=filters->>'time_from')
 AND (COALESCE(filters->>'time_to','')='' OR to_char(a.date_time AT TIME ZONE 'Asia/Almaty','HH24:MI')<=filters->>'time_to')
 AND (CASE WHEN filters->>'view'='archive' THEN a.status IN ('completed','cancelled') OR a.date_time+make_interval(mins=>COALESCE(a.duration_minutes,120))<=now() WHEN filters->>'view'='saved' THEN EXISTS(SELECT 1 FROM public.saved_events s WHERE s.activity_id=a.id AND s.user_id=auth.uid()) ELSE a.status NOT IN ('completed','cancelled') AND (a.date_time IS NULL OR a.date_time>now()) END)
 AND (NOT COALESCE((filters->>'open')::boolean,false) OR (a.status IN ('open','nearly_full') AND a.registered_count<a.max_participants AND (a.registration_deadline IS NULL OR a.registration_deadline>now()) AND (a.date_time IS NULL OR a.date_time>now())))
 ), ordered AS (SELECT * FROM candidates ORDER BY
 CASE WHEN filters->>'sort'='personal' THEN relevance END DESC NULLS LAST,
 CASE WHEN filters->>'sort'='price' THEN CASE WHEN is_free THEN 0 ELSE entry_fee END END ASC NULLS LAST,
 CASE WHEN COALESCE(filters->>'sort','available')='available' THEN (status IN ('open','nearly_full') AND registered_count<max_participants AND (registration_deadline IS NULL OR registration_deadline>now()))::integer END DESC,
 date_time ASC NULLS LAST,id OFFSET page*24 LIMIT 24)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(x)-'invite_code'-'relevance'||jsonb_build_object('host_rating',NULLIF(x.live_rating,0),'host_rating_count',x.live_rating_count)) FROM ordered x),'[]'),'total',(SELECT count(*) FROM candidates),'page',page) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_feed(jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_feed(jsonb,integer) TO anon,authenticated;
-- Saved-event reminders are opt-in, deduplicated and do not reserve a place.
CREATE FUNCTION public.saved_event_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record;
BEGIN
 FOR s IN SELECT f.user_id,a.id,a.title,a.date_time FROM public.saved_events f JOIN public.activities a ON a.id=f.activity_id WHERE f.reminder AND a.status IN ('open','nearly_full') AND a.date_time>now() AND a.date_time<=now()+interval '24 hours' LOOP
 PERFORM public.profile_notify(s.user_id,'games','Скоро сохранённая игра',s.title||'. Сохранение не резервирует место.','/activity/'||s.id,'saved:'||s.user_id||':'||s.id||':'||s.date_time); END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.saved_event_reminders() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.profile_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.profiles SET account_status='active',restriction_reason=NULL,restriction_until=NULL WHERE account_status IN ('flagged','suspended') AND restriction_until<=now();
 PERFORM public.profile_generate_reminders();
 PERFORM public.saved_event_reminders();
END $$;
