-- Opt-in, in-app alerts for new public games. Drafts stay in host_documents;
-- an activity is published when it first becomes publicly open for registration.
CREATE TABLE public.game_alert_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 city text NOT NULL CHECK(city=trim(city) AND length(city) BETWEEN 2 AND 80),
 sport text NOT NULL DEFAULT 'all' CHECK(sport=trim(sport) AND length(sport) BETWEEN 1 AND 50),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,city,sport)
);
CREATE INDEX game_alert_subscriptions_match ON public.game_alert_subscriptions(city,sport);
ALTER TABLE public.game_alert_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.game_alert_subscriptions TO authenticated;
GRANT ALL ON public.game_alert_subscriptions TO service_role;
CREATE POLICY game_alert_subscriptions_own ON public.game_alert_subscriptions
 FOR SELECT TO authenticated USING(user_id=auth.uid());

-- Mark every pre-existing activity as seen: installing this feature must not
-- send old events when a user subscribes, an event is edited, or a place opens.
CREATE TABLE public.game_alert_publications (
 activity_id uuid PRIMARY KEY REFERENCES public.activities(id) ON DELETE CASCADE,
 published_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.game_alert_publications(activity_id) SELECT id FROM public.activities;
ALTER TABLE public.game_alert_publications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.game_alert_publications TO service_role;

CREATE FUNCTION public.game_alert_preferences(action text,payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); selected_city text:=trim(COALESCE(payload->>'city',''));
 selected_sport text:=trim(COALESCE(payload->>'sport','all')); subscription_id uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF action='get' THEN
  RETURN jsonb_build_object(
   'subscriptions',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC,s.id) FROM public.game_alert_subscriptions s WHERE s.user_id=u),'[]'),
   'games_enabled',COALESCE((SELECT (notifications->>'games')::boolean FROM public.profile_preferences WHERE user_id=u),true));
 ELSIF action='subscribe' THEN
  IF length(selected_city) NOT BETWEEN 2 AND 80 OR selected_city='all' THEN RAISE EXCEPTION 'Выберите город'; END IF;
  -- Keep subscriptions in the same canonical spelling as the game catalog.
  -- Built-in names take precedence over case variants in the managed catalog.
  SELECT candidate.name INTO selected_city FROM (
   SELECT name,0 AS priority FROM unnest(ARRAY['Астана','Алматы','Шымкент','Караганда']) name
   UNION ALL
   SELECT trim(city),1 FROM public.site_settings settings
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(settings.value->'cities')='array' THEN settings.value->'cities' ELSE '[]'::jsonb END) city
    WHERE settings.key='catalog' AND length(trim(city)) BETWEEN 2 AND 80 AND lower(trim(city))<>'all'
  ) candidate WHERE lower(candidate.name)=lower(selected_city) ORDER BY candidate.priority,candidate.name LIMIT 1;
  IF selected_city IS NULL THEN RAISE EXCEPTION 'Выберите город'; END IF;
  IF lower(selected_sport)='all' THEN selected_sport:='all'; ELSE
   SELECT name INTO selected_sport FROM public.disciplines WHERE lower(name)=lower(selected_sport) AND kind='sport';
   IF selected_sport IS NULL THEN RAISE EXCEPTION 'Выберите вид спорта'; END IF;
  END IF;
  -- Serialize concurrent saves for one account before checking the limit.
  PERFORM 1 FROM public.profiles WHERE id=u FOR UPDATE;
  SELECT id INTO subscription_id FROM public.game_alert_subscriptions WHERE user_id=u AND city=selected_city AND sport=selected_sport;
  IF subscription_id IS NULL THEN
   IF (SELECT count(*) FROM public.game_alert_subscriptions WHERE user_id=u)>=20 THEN RAISE EXCEPTION 'Можно сохранить до 20 подписок'; END IF;
   INSERT INTO public.game_alert_subscriptions(user_id,city,sport) VALUES(u,selected_city,selected_sport) RETURNING id INTO subscription_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',subscription_id);
 ELSIF action='unsubscribe' THEN
  DELETE FROM public.game_alert_subscriptions WHERE id=NULLIF(payload->>'id','')::uuid AND user_id=u RETURNING id INTO subscription_id;
  IF subscription_id IS NULL THEN RAISE EXCEPTION 'Подписка недоступна'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Неизвестное действие';
END $$;
REVOKE ALL ON FUNCTION public.game_alert_preferences(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.game_alert_preferences(text,jsonb) TO authenticated;

CREATE FUNCTION public.notify_new_public_game() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE first_publication uuid; recipient record;
BEGIN
 IF NEW.is_private OR NEW.status NOT IN ('open','nearly_full')
  OR NEW.registered_count>=NEW.max_participants
  OR (NEW.date_time IS NOT NULL AND NEW.date_time<=now())
  OR (NEW.registration_deadline IS NOT NULL AND NEW.registration_deadline<=now()) THEN RETURN NEW; END IF;
 INSERT INTO public.game_alert_publications(activity_id) VALUES(NEW.id)
  ON CONFLICT(activity_id) DO NOTHING RETURNING activity_id INTO first_publication;
 IF first_publication IS NULL THEN RETURN NEW; END IF;
 -- A global pause suppresses this one-shot publication instead of backfilling
 -- notifications when a later edit happens after registration is enabled.
 IF COALESCE((SELECT (value->>'registrations_enabled')::boolean FROM public.site_settings WHERE key='business'),true)=false THEN RETURN NEW; END IF;
 FOR recipient IN
  SELECT DISTINCT s.user_id FROM public.game_alert_subscriptions s
  JOIN public.profiles p ON p.id=s.user_id AND p.account_status='active'
  WHERE s.city=NEW.city AND (s.sport='all' OR s.sport=NEW.sport)
   AND s.user_id IS DISTINCT FROM NEW.manager_id AND s.user_id IS DISTINCT FROM NEW.organizer_id
   AND NOT EXISTS(SELECT 1 FROM public.registrations r WHERE r.activity_id=NEW.id AND r.user_id=s.user_id AND r.status IN ('registered','attended'))
 LOOP
  PERFORM public.profile_notify(recipient.user_id,'games','Новая игра в вашем городе',
   NEW.title||' · '||NEW.sport||' · '||NEW.city,'/activity/'||NEW.id,
   'new-game:'||recipient.user_id||':'||NEW.id);
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_new_public_game() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER game_alert_on_publication AFTER INSERT OR UPDATE OF
 is_private,status,registered_count,max_participants,date_time,registration_deadline
 ON public.activities FOR EACH ROW EXECUTE FUNCTION public.notify_new_public_game();
