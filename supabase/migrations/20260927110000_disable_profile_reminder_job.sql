-- Scheduled profile maintenance (reminders, restriction expiry) is not used for
-- now. Remove the pg_cron job where it was scheduled; no-op without pg_cron.
-- profile_maintenance() stays available for manual or future scheduled runs.
DO $$
BEGIN
  -- Nested so cron.job is only referenced when the extension exists.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sportura-profile-reminders') THEN
      PERFORM cron.unschedule('sportura-profile-reminders');
    END IF;
  END IF;
END $$;
