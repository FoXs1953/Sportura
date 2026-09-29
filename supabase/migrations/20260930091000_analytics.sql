CREATE TABLE public.analytics_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 visitor_id uuid NOT NULL, session_id uuid NOT NULL, user_id uuid,
 event text NOT NULL CHECK(event IN ('page_view','activity_view','register_click')),
 path text NOT NULL CHECK(length(path)<=160),
 source text NOT NULL CHECK(source IN ('direct','instagram','telegram','search','other')),
 device text NOT NULL CHECK(device IN ('mobile','desktop')),
 UNIQUE(session_id,event,path)
);
CREATE INDEX analytics_created ON public.analytics_events(created_at);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_events FROM anon,authenticated;
CREATE FUNCTION public.track_event(payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid; s uuid; p text; e text;
BEGIN
 v:=(payload->>'visitor_id')::uuid;s:=(payload->>'session_id')::uuid;p:=payload->>'path';e:=payload->>'event';
 IF v IS NULL OR s IS NULL OR p IS NULL OR p !~ '^/[a-zA-Z0-9/_-]*$' OR length(p)>160 OR e NOT IN ('page_view','activity_view','register_click') THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(s::text));
 IF (SELECT count(*) FROM public.analytics_events WHERE session_id=s)>=100 THEN RETURN; END IF;
 INSERT INTO public.analytics_events(visitor_id,session_id,user_id,event,path,source,device) VALUES(v,s,auth.uid(),e,p,CASE WHEN payload->>'source' IN ('instagram','telegram','search','other') THEN payload->>'source' ELSE 'direct' END,CASE WHEN payload->>'device'='mobile' THEN 'mobile' ELSE 'desktop' END) ON CONFLICT(session_id,event,path) DO UPDATE SET user_id=COALESCE(analytics_events.user_id,EXCLUDED.user_id);
END $$;
REVOKE ALL ON FUNCTION public.track_event(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_event(jsonb) TO anon,authenticated;
CREATE FUNCTION public.staff_analytics(date_from timestamptz,date_to timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE answer jsonb;
BEGIN
 IF NOT public.is_staff() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;
 IF date_from IS NULL OR date_to IS NULL OR date_to<=date_from OR date_to-date_from>interval '366 days' THEN RAISE EXCEPTION 'Выберите период до 366 дней'; END IF;
 WITH e AS (SELECT * FROM public.analytics_events WHERE created_at>=date_from AND created_at<date_to),
 r AS (SELECT * FROM public.registrations WHERE created_at>=date_from AND created_at<date_to),
 u AS (SELECT * FROM auth.users WHERE created_at>=date_from AND created_at<date_to),
 a AS (SELECT * FROM public.activities WHERE created_at>=date_from AND created_at<date_to),
 m AS (SELECT * FROM public.manager_applications WHERE created_at>=date_from AND created_at<date_to),
 cohort AS (SELECT visitor_id,min(created_at) first_at,min(created_at) FILTER(WHERE event='activity_view') viewed,min(created_at) FILTER(WHERE event='register_click') clicked FROM e GROUP BY visitor_id),
 funnel AS (SELECT c.*, EXISTS(SELECT 1 FROM e linked JOIN auth.users account ON account.id=linked.user_id WHERE linked.visitor_id=c.visitor_id AND account.created_at>=c.clicked AND account.created_at<date_to) signed_up,
 EXISTS(SELECT 1 FROM e linked JOIN auth.users account ON account.id=linked.user_id JOIN public.registrations reg ON reg.user_id=account.id WHERE linked.visitor_id=c.visitor_id AND account.created_at>=c.clicked AND account.created_at<date_to AND reg.created_at>=account.created_at AND reg.created_at<date_to) registered,
 EXISTS(SELECT 1 FROM e linked JOIN auth.users account ON account.id=linked.user_id JOIN public.registrations reg ON reg.user_id=account.id WHERE linked.visitor_id=c.visitor_id AND account.created_at>=c.clicked AND reg.created_at>=account.created_at AND reg.created_at<date_to AND reg.amount_due>0 AND reg.payment_status='paid' AND reg.paid_at<date_to) paid FROM cohort c)
 SELECT jsonb_build_object(
 'traffic',jsonb_build_object('visits',(SELECT count(DISTINCT session_id) FROM e),'visitors',(SELECT count(DISTINCT visitor_id) FROM e),'mobile',(SELECT count(DISTINCT session_id) FROM e WHERE device='mobile')),
 'sources',(SELECT COALESCE(jsonb_agg(t),'[]') FROM(SELECT source,count(DISTINCT session_id) visits FROM e GROUP BY source ORDER BY visits DESC)t),
 'pages',(SELECT COALESCE(jsonb_agg(t),'[]') FROM(SELECT path,count(*) views FROM e WHERE event='page_view' GROUP BY path ORDER BY views DESC LIMIT 20)t),
 'accounts',jsonb_build_object('total',(SELECT count(*) FROM u),'verified',(SELECT count(*) FROM u WHERE email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)),
 'daily',(SELECT COALESCE(jsonb_agg(t ORDER BY t."day"),'[]') FROM(SELECT d::date AS "day",(SELECT count(*) FROM u WHERE (created_at AT TIME ZONE 'Asia/Almaty')::date=d::date) accounts,(SELECT count(DISTINCT session_id) FROM e WHERE (created_at AT TIME ZONE 'Asia/Almaty')::date=d::date) visits FROM generate_series((date_from AT TIME ZONE 'Asia/Almaty')::date,((date_to-interval '1 microsecond') AT TIME ZONE 'Asia/Almaty')::date,interval '1 day')d)t),
 'activity',jsonb_build_object('registrations',(SELECT count(*) FROM r),'paid',(SELECT count(*) FROM r WHERE payment_status='paid' AND amount_due>0),'chargeable',(SELECT count(*) FROM r WHERE amount_due>0),'cancelled',(SELECT count(*) FROM r WHERE status='cancelled'),'no_show',(SELECT count(*) FROM r WHERE status='no_show')),
 'active',jsonb_build_object('dau',(SELECT count(DISTINCT user_id) FROM public.analytics_events WHERE user_id IS NOT NULL AND created_at>=date_to-interval '1 day' AND created_at<date_to),'wau',(SELECT count(DISTINCT user_id) FROM public.analytics_events WHERE user_id IS NOT NULL AND created_at>=date_to-interval '7 days' AND created_at<date_to),'mau',(SELECT count(DISTINCT user_id) FROM public.analytics_events WHERE user_id IS NOT NULL AND created_at>=date_to-interval '30 days' AND created_at<date_to)),
 'funnel',jsonb_build_object('visitors',(SELECT count(*) FROM funnel),'activity_views',(SELECT count(*) FROM funnel WHERE viewed>=first_at),'register_clicks',(SELECT count(*) FROM funnel WHERE clicked>=viewed),'accounts',(SELECT count(*) FROM funnel WHERE clicked>=viewed AND signed_up),'registrations',(SELECT count(*) FROM funnel WHERE clicked>=viewed AND signed_up AND registered),'paid',(SELECT count(*) FROM funnel WHERE clicked>=viewed AND signed_up AND registered AND paid)),
 'organizers',jsonb_build_object('applications',(SELECT count(*) FROM m),'approved',(SELECT count(*) FROM m WHERE status='approved'),'events',(SELECT count(*) FROM a),'capacity',(SELECT COALESCE(sum(max_participants),0) FROM a),'occupied',(SELECT COALESCE(sum(registered_count),0) FROM a)),
 'since',(SELECT min(created_at) FROM public.analytics_events)
 ) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.staff_analytics(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_analytics(timestamptz,timestamptz) TO authenticated;
