CREATE FUNCTION public.profile_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.profiles SET account_status='active',restriction_reason=NULL,restriction_until=NULL
 WHERE account_status IN ('flagged','suspended') AND restriction_until IS NOT NULL AND restriction_until<=now();
 PERFORM public.profile_generate_reminders();
END $$;
REVOKE ALL ON FUNCTION public.profile_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.profile_maintenance() TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('sportura-profile-reminders','*/5 * * * *','SELECT public.profile_maintenance();');
 END IF;
END $$;
