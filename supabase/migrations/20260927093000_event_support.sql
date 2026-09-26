ALTER TABLE public.support_tickets ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;
ALTER FUNCTION public.profile_workspace(text,jsonb) RENAME TO profile_workspace_v1;
REVOKE EXECUTE ON FUNCTION public.profile_workspace_v1(text,jsonb) FROM authenticated;
CREATE FUNCTION public.profile_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); aid uuid:=NULLIF(payload->>'activity_id','')::uuid; rid uuid:=NULLIF(payload->>'registration_id','')::uuid; existing uuid; result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF action='ticket' THEN
  IF aid IS NOT NULL AND NOT(public.is_activity_host(aid,u) OR EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=aid AND user_id=u)) THEN RAISE EXCEPTION 'Событие недоступно'; END IF;
  IF rid IS NOT NULL THEN SELECT activity_id INTO aid FROM public.registrations WHERE id=rid AND user_id=u; IF aid IS NULL THEN RAISE EXCEPTION 'Запись недоступна'; END IF; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(u::text||COALESCE(aid::text,'support')));
  SELECT id INTO existing FROM public.support_tickets WHERE user_id=u AND status<>'resolved' AND topic=payload->>'topic' AND review_id IS NOT DISTINCT FROM NULLIF(payload->>'review_id','')::uuid AND ((rid IS NOT NULL AND registration_id=rid) OR (aid IS NOT NULL AND activity_id=aid AND registration_id IS NULL)) LIMIT 1;
  IF existing IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.support_messages WHERE ticket_id=existing AND author_id=u AND body=trim(payload->>'body') AND created_at>now()-interval '1 minute') THEN RETURN jsonb_build_object('ok',true,'id',existing); END IF;
   RETURN public.profile_workspace_v1('reply',payload||jsonb_build_object('id',existing));
  END IF;
  result:=public.profile_workspace_v1(action,payload);
  UPDATE public.support_tickets SET activity_id=aid WHERE id=(result->>'id')::uuid AND user_id=u;
  RETURN result;
 END IF;
 RETURN public.profile_workspace_v1(action,payload);
END $$;
REVOKE ALL ON FUNCTION public.profile_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_workspace(text,jsonb) TO authenticated;
