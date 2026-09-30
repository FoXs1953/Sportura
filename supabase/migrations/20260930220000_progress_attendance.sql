DO $patch$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.player_progress(uuid)'::regprocedure);
 definition:=replace(definition,'reg.status IN (''registered'',''attended'')','reg.status IN (''registered'',''attended'',''no_show'')');
 definition:=replace(definition,'r.created_at>COALESCE((SELECT max(q.created_at) FROM public.registrations q WHERE q.user_id=uid AND q.status=''no_show''),''epoch'')','a.date_time>COALESCE((SELECT max(missed.date_time) FROM public.registrations q JOIN public.activities missed ON missed.id=q.activity_id WHERE q.user_id=uid AND q.status=''no_show'' AND missed.type<>''daily_game'' AND NOT missed.is_private),''epoch'') AND a.results_submitted_at IS NOT NULL AND a.dispute_window_ends_at<=now()');
 EXECUTE definition;
END $patch$;
