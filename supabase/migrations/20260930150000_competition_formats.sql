-- Common competition setting, validated alongside discipline-specific fields.
DO $settings$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.validate_match_settings()'::regprocedure);
 definition:=replace(definition,'IF jsonb_typeof(NEW.match_settings)', 'config:=COALESCE(config,''[]''::jsonb)||''[{"key":"league_legs","label":"Кругов лиги","type":"select","options":["1","2"],"default":"1"}]''::jsonb; IF jsonb_typeof(NEW.match_settings)');
 EXECUTE definition;
END $settings$;
ALTER TABLE public.activities DROP CONSTRAINT activities_competition_format_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_competition_format_check CHECK(competition_format IN ('single_elimination','round_robin','double_elimination','groups_playoff','swiss','league_playoff'));
ALTER TABLE public.event_matches ADD COLUMN stage text NOT NULL DEFAULT 'main', ADD COLUMN group_number integer;
CREATE TABLE public.event_seeds(activity_id uuid NOT NULL REFERENCES public.activities(id),registration_id uuid NOT NULL REFERENCES public.registrations(id),seed integer NOT NULL,group_number integer,qualified boolean NOT NULL DEFAULT false,PRIMARY KEY(activity_id,registration_id),UNIQUE(activity_id,seed));
CREATE TABLE public.event_byes(activity_id uuid NOT NULL REFERENCES public.activities(id),registration_id uuid NOT NULL REFERENCES public.registrations(id),round integer NOT NULL,points integer NOT NULL DEFAULT 0,PRIMARY KEY(activity_id,registration_id,round));
ALTER TABLE public.event_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_byes ENABLE ROW LEVEL SECURITY;
-- Only the competition functions write these records; public reads go through event_public.
CREATE FUNCTION public.competition_pair(aid uuid,ids uuid[],rnd integer,phase text,grp integer DEFAULT NULL,bye_points integer DEFAULT 0) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i integer:=1; pos integer; n integer:=COALESCE(cardinality(ids),0);
BEGIN
 SELECT COALESCE(max(position),0) INTO pos FROM public.event_matches WHERE activity_id=aid AND round=rnd;
 WHILE i<n LOOP
  pos:=pos+1;
  INSERT INTO public.event_matches(activity_id,round,position,home_id,away_id,stage,group_number) VALUES(aid,rnd,pos,ids[i],ids[i+1],phase,grp);
  i:=i+2;
 END LOOP;
 IF n%2=1 THEN INSERT INTO public.event_byes(activity_id,registration_id,round,points) VALUES(aid,ids[n],rnd,bye_points); END IF;
END $$;
REVOKE ALL ON FUNCTION public.competition_pair(uuid,uuid[],integer,text,integer,integer) FROM PUBLIC,anon,authenticated;
-- Backtracking prevents a greedy Swiss pairing from stranding the final players.
CREATE FUNCTION public.swiss_pairs(aid uuid,ids uuid[]) RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE i integer; rest uuid[]; paired uuid[];
BEGIN
 IF cardinality(ids)=0 THEN RETURN '{}'::uuid[]; END IF;
 FOR i IN 2..cardinality(ids) LOOP
  IF EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND ((home_id=ids[1] AND away_id=ids[i]) OR (away_id=ids[1] AND home_id=ids[i]))) THEN CONTINUE; END IF;
  SELECT COALESCE(array_agg(x ORDER BY ord),'{}'::uuid[]) INTO rest FROM unnest(ids) WITH ORDINALITY t(x,ord) WHERE ord NOT IN (1,i);
  paired:=public.swiss_pairs(aid,rest);
  IF paired IS NOT NULL THEN RETURN ARRAY[ids[1],ids[i]]||paired; END IF;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.swiss_pairs(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.competition_scoreboard(aid uuid) RETURNS TABLE(registration_id uuid,name text,seed integer,group_number integer,played bigint,won bigint,drawn bigint,lost bigint,scored bigint,conceded bigint,difference bigint,points bigint,buchholz bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH games AS (
  SELECT home_id id,away_id opponent,home_score scored,away_score conceded FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL AND stage<>'playoff'
  UNION ALL SELECT away_id,home_id,away_score,home_score FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL AND stage<>'playoff'
 ), totals AS (
 SELECT r.id,COALESCE(NULLIF(r.team_name,''),p.name) name,s.seed,s.group_number,count(g.id) played,
 count(g.id) FILTER(WHERE g.scored>g.conceded) won,count(g.id) FILTER(WHERE g.scored=g.conceded) drawn,count(g.id) FILTER(WHERE g.scored<g.conceded) lost,
 COALESCE(sum(g.scored),0) scored,COALESCE(sum(g.conceded),0) conceded,COALESCE(sum(g.scored-g.conceded),0) difference,
 COALESCE(sum(CASE WHEN g.scored>g.conceded THEN a.win_points WHEN g.scored=g.conceded THEN a.draw_points ELSE 0 END),0)+COALESCE((SELECT sum(b.points) FROM public.event_byes b WHERE b.activity_id=aid AND b.registration_id=r.id),0) points
 FROM public.registrations r JOIN public.profiles p ON p.id=r.user_id JOIN public.activities a ON a.id=r.activity_id JOIN public.event_seeds s ON s.activity_id=aid AND s.registration_id=r.id LEFT JOIN games g ON g.id=r.id
 WHERE r.activity_id=aid GROUP BY r.id,p.name,s.seed,s.group_number
 ) SELECT t.*,COALESCE((SELECT sum(o.points) FROM games g JOIN totals o ON o.id=g.opponent WHERE g.id=t.id),0)::bigint FROM totals t;
$$;
REVOKE ALL ON FUNCTION public.competition_scoreboard(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.advanced_competition_winner(aid uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; ids uuid[];
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=aid;
 IF a.competition_format='double_elimination' THEN
  SELECT array_agg(s.registration_id) INTO ids FROM public.event_seeds s WHERE s.activity_id=aid AND (SELECT count(*) FROM public.event_matches m WHERE m.activity_id=aid AND s.registration_id IN (m.home_id,m.away_id) AND m.winner_id IS NOT NULL AND m.winner_id<>s.registration_id)<2;
 ELSE
  SELECT array_agg(s.registration_id) INTO ids FROM public.event_seeds s WHERE s.activity_id=aid AND s.qualified AND NOT EXISTS(SELECT 1 FROM public.event_matches m WHERE m.activity_id=aid AND m.stage='playoff' AND s.registration_id IN (m.home_id,m.away_id) AND m.winner_id IS NOT NULL AND m.winner_id<>s.registration_id);
 END IF;
 IF cardinality(ids)<>1 OR ids IS NULL THEN RAISE EXCEPTION 'Сначала проведите оставшиеся раунды'; END IF;
 RETURN ids[1];
END $$;
REVOKE ALL ON FUNCTION public.advanced_competition_winner(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.advanced_competition_round(aid uuid,initial boolean,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; ids uuid[]; upper_ids uuid[]; lower_ids uuid[]; paired uuid[]; bye uuid; rnd integer; n integer; i integer; j integer; pos integer:=0; grp integer; group_count integer; legs integer; leg integer; rounds integer; seed_mode text; manual uuid[];
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF initial THEN
  IF EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Расписание уже создано'; END IF;
  seed_mode:=COALESCE(payload->>'seeding','registration');
  SELECT array_agg(id ORDER BY created_at,id) INTO ids FROM public.registrations WHERE activity_id=aid AND status IN ('registered','attended');
  n:=COALESCE(cardinality(ids),0);
  IF n<greatest(a.min_participants,2) OR n>128 THEN RAISE EXCEPTION 'Для сетки нужно от минимума события до 128 участников'; END IF;
  IF seed_mode='random' THEN SELECT array_agg(id ORDER BY random()) INTO ids FROM unnest(ids) id;
  ELSIF seed_mode='manual' THEN
   SELECT array_agg(value::uuid ORDER BY ord) INTO manual FROM jsonb_array_elements_text(payload->'seeds') WITH ORDINALITY x(value,ord);
   IF cardinality(manual) IS DISTINCT FROM n OR NOT(manual @> ids AND manual <@ ids) OR (SELECT count(DISTINCT id) FROM unnest(manual) id)<>n THEN RAISE EXCEPTION 'Укажите каждого участника ровно один раз'; END IF;
   ids:=manual;
  ELSIF seed_mode<>'registration' THEN RAISE EXCEPTION 'Неизвестный способ посева'; END IF;
  INSERT INTO public.event_seeds(activity_id,registration_id,seed) SELECT aid,id,ord FROM unnest(ids) WITH ORDINALITY x(id,ord);
  rnd:=1;
  IF a.competition_format IN ('groups_playoff','league_playoff','round_robin') THEN
   IF n<4 AND a.competition_format<>'round_robin' THEN RAISE EXCEPTION 'Для групп и плей-офф нужно минимум четыре участника'; END IF;
   group_count:=CASE WHEN a.competition_format IN ('league_playoff','round_robin') THEN 1 ELSE greatest(2,ceil(n/4.0)::integer) END;
   UPDATE public.event_seeds SET group_number=1+(seed-1)%group_count WHERE activity_id=aid;
   legs:=CASE WHEN a.competition_format='league_playoff' THEN COALESCE(NULLIF(a.match_settings->>'league_legs','')::integer,1) ELSE 1 END;
   IF legs NOT IN (1,2) THEN RAISE EXCEPTION 'Выберите один или два круга'; END IF;
   FOR grp IN 1..group_count LOOP
    SELECT array_agg(registration_id ORDER BY seed) INTO ids FROM public.event_seeds WHERE activity_id=aid AND group_number=grp;
    FOR leg IN 1..legs LOOP
     FOR i IN 1..cardinality(ids)-1 LOOP FOR j IN i+1..cardinality(ids) LOOP
      pos:=pos+1;
      INSERT INTO public.event_matches(activity_id,round,position,home_id,away_id,stage,group_number) VALUES(aid,1,pos,CASE WHEN leg=1 THEN ids[i] ELSE ids[j] END,CASE WHEN leg=1 THEN ids[j] ELSE ids[i] END,'groups',grp);
     END LOOP; END LOOP;
    END LOOP;
   END LOOP;
  ELSE
   IF a.competition_format='swiss' THEN
    IF n%2=1 THEN bye:=ids[n];ids:=ids[1:n-1];INSERT INTO public.event_byes VALUES(aid,bye,1,a.win_points); END IF;
    PERFORM public.competition_pair(aid,ids,1,'swiss');
   ELSIF a.competition_format='single_elimination' THEN
    UPDATE public.event_seeds SET qualified=true WHERE activity_id=aid;
    PERFORM public.competition_pair(aid,ids,1,'playoff');
   ELSE PERFORM public.competition_pair(aid,ids,1,'upper'); END IF;
  END IF;
  UPDATE public.activities SET registration_deadline=LEAST(registration_deadline,now()) WHERE id=aid;
 ELSE
  SELECT max(round) INTO rnd FROM public.event_matches WHERE activity_id=aid;
  IF rnd IS NULL OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND home_score IS NULL) THEN RAISE EXCEPTION 'Сначала заполните результаты текущих матчей'; END IF;
  rnd:=rnd+1;
  IF a.competition_format='double_elimination' THEN
   SELECT array_agg(s.registration_id ORDER BY (SELECT count(*) FROM public.event_byes b WHERE b.activity_id=aid AND b.registration_id=s.registration_id) DESC,s.seed) FILTER(WHERE losses=0),array_agg(s.registration_id ORDER BY (SELECT count(*) FROM public.event_byes b WHERE b.activity_id=aid AND b.registration_id=s.registration_id) DESC,s.seed) FILTER(WHERE losses=1) INTO upper_ids,lower_ids
   FROM public.event_seeds s CROSS JOIN LATERAL (SELECT count(*) losses FROM public.event_matches m WHERE m.activity_id=aid AND s.registration_id IN (m.home_id,m.away_id) AND m.winner_id IS NOT NULL AND m.winner_id<>s.registration_id) x WHERE s.activity_id=aid;
   n:=COALESCE(cardinality(upper_ids),0)+COALESCE(cardinality(lower_ids),0);
   IF n<2 THEN RAISE EXCEPTION 'Победитель уже определён'; END IF;
   IF n=2 THEN PERFORM public.competition_pair(aid,COALESCE(upper_ids,'{}')||COALESCE(lower_ids,'{}'),rnd,'final');
   ELSE
    PERFORM public.competition_pair(aid,COALESCE(upper_ids,'{}'),rnd,'upper');
    PERFORM public.competition_pair(aid,COALESCE(lower_ids,'{}'),rnd,'lower');
   END IF;
  ELSIF a.competition_format='swiss' THEN
   SELECT count(*) INTO n FROM public.event_seeds WHERE activity_id=aid;
   rounds:=least(n-1,ceil(log(2,n))::integer);
   IF rnd>rounds THEN RAISE EXCEPTION 'Все туры швейцарской системы проведены'; END IF;
   SELECT array_agg(registration_id ORDER BY points DESC,buchholz DESC,difference DESC,scored DESC,seed) INTO ids FROM public.competition_scoreboard(aid);
   IF n%2=1 THEN
    SELECT s.registration_id INTO bye FROM public.competition_scoreboard(aid) s WHERE NOT EXISTS(SELECT 1 FROM public.event_byes b WHERE b.activity_id=aid AND b.registration_id=s.registration_id) ORDER BY points,buchholz,difference,scored,seed DESC LIMIT 1;
    ids:=array_remove(ids,bye);
    INSERT INTO public.event_byes VALUES(aid,bye,rnd,a.win_points);
   END IF;
   paired:=public.swiss_pairs(aid,ids);
   IF paired IS NULL THEN RAISE EXCEPTION 'Не удалось составить пары без повторов. Обратитесь в поддержку'; END IF;
   PERFORM public.competition_pair(aid,paired,rnd,'swiss');
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND stage='playoff') THEN
    UPDATE public.event_seeds SET qualified=true WHERE activity_id=aid AND registration_id IN (
      SELECT registration_id FROM (SELECT registration_id,row_number() OVER(PARTITION BY group_number ORDER BY points DESC,difference DESC,scored DESC,seed) place FROM public.competition_scoreboard(aid)) ranks WHERE place<=CASE WHEN a.competition_format='league_playoff' THEN 4 ELSE 2 END);
   END IF;
   SELECT array_agg(s.registration_id ORDER BY s.group_number,s.seed) INTO ids FROM public.event_seeds s WHERE s.activity_id=aid AND s.qualified AND NOT EXISTS(SELECT 1 FROM public.event_matches m WHERE m.activity_id=aid AND m.stage='playoff' AND s.registration_id IN(m.home_id,m.away_id) AND m.winner_id IS NOT NULL AND m.winner_id<>s.registration_id);
   IF COALESCE(cardinality(ids),0)<2 THEN RAISE EXCEPTION 'Победитель уже определён'; END IF;
   -- Pair opposite ends to spread entrants from the same group in the first playoff round.
   IF NOT EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND stage='playoff') THEN
    SELECT array_agg(id ORDER BY CASE WHEN ord<=ceil(cardinality(ids)/2.0) THEN ord*2 ELSE (cardinality(ids)-ord+1)*2+1 END) INTO ids FROM unnest(ids) WITH ORDINALITY t(id,ord);
   END IF;
   PERFORM public.competition_pair(aid,ids,rnd,'playoff');
  END IF;
 END IF;
 PERFORM public.event_log(aid,NULL,'Сформирован раунд',jsonb_build_object('round',rnd,'format',a.competition_format));
END $$;
REVOKE ALL ON FUNCTION public.advanced_competition_round(uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.event_competition_sports_base(text,jsonb)'::regprocedure);
 definition:=replace(definition,'SELECT array_agg(r.id) INTO ids FROM public.registrations r WHERE r.activity_id=aid AND r.status IN (''registered'',''attended'') AND NOT EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND (x.home_id=r.id OR x.away_id=r.id) AND x.winner_id IS NOT NULL AND x.winner_id<>r.id)','SELECT array_agg(entrant.id) INTO ids FROM public.registrations entrant WHERE entrant.activity_id=aid AND entrant.status IN (''registered'',''attended'') AND NOT EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND (x.home_id=entrant.id OR x.away_id=entrant.id) AND x.winner_id IS NOT NULL AND x.winner_id<>entrant.id)');
 definition:=replace(definition,'IF a.competition_format=''single_elimination'' AND EXISTS','IF a.competition_format<>''round_robin'' AND EXISTS');
 definition:=replace(definition,'(payload->>''away_score'')::integer IS DISTINCT FROM m.away_score)', '(payload->>''away_score'')::integer IS DISTINCT FROM m.away_score OR COALESCE(NULLIF(payload->>''winner_id'','''')::uuid,m.winner_id) IS DISTINCT FROM m.winner_id)');
 definition:=replace(definition,'a.competition_format=''single_elimination'' AND payload->>''home_score'' IS NOT NULL', '(a.competition_format IN (''single_elimination'',''double_elimination'') OR m.stage=''playoff'') AND payload->>''home_score'' IS NOT NULL');
 definition:=replace(definition,'IF a.competition_format=''single_elimination'' THEN',
  'IF a.competition_format IN (''double_elimination'',''groups_playoff'',''league_playoff'') THEN winner:=public.advanced_competition_winner(aid);
   ELSIF a.competition_format=''swiss'' THEN
    SELECT count(*) INTO n FROM public.event_seeds WHERE activity_id=aid;
    IF (SELECT max(round) FROM public.event_matches WHERE activity_id=aid)<least(n-1,ceil(log(2,n))::integer) THEN RAISE EXCEPTION ''Сначала проведите все туры''; END IF;
    SELECT registration_id INTO winner FROM public.competition_scoreboard(aid) ORDER BY points DESC,buchholz DESC,difference DESC,scored DESC,seed LIMIT 1;
   ELSIF a.competition_format=''single_elimination'' THEN');
 EXECUTE definition;
 definition:=replace(definition,'n>32','n>128');
 definition:=replace(definition,'до 32 команд','до 128 команд');
 EXECUTE definition;
 -- Preserve the league format selected by its organizer.
 definition:=pg_get_functiondef('public.event_workspace_v1(text,jsonb)'::regprocedure);
 definition:=replace(definition,'CASE WHEN type=''league'' THEN ''round_robin'' ELSE COALESCE(vals->>''competition_format'',''single_elimination'') END','COALESCE(vals->>''competition_format'',CASE WHEN type=''league'' THEN ''round_robin'' ELSE ''single_elimination'' END)');
 definition:=replace(definition,'integer>32','integer>128');
 definition:=replace(definition,'до 32 участников','до 128 участников');
 EXECUTE definition;
END $patch$;
ALTER FUNCTION public.event_competition(text,jsonb) RENAME TO event_competition_formats_base;
REVOKE ALL ON FUNCTION public.event_competition_formats_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_competition(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid:=(payload->>'activity_id')::uuid; a public.activities; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF a.id IS NULL OR NOT(public.is_activity_host(aid,auth.uid()) OR public.is_admin()) THEN RAISE EXCEPTION 'Соревнование недоступно'; END IF;
 IF action='generate' OR (action='advance' AND a.competition_format<>'round_robin') THEN
  IF a.type='daily_game' OR a.status IN ('cancelled','completed') OR a.results_submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Соревнование завершено или недоступно'; END IF;
  PERFORM public.advanced_competition_round(aid,action='generate',payload);
  RETURN jsonb_build_object('ok',true);
 END IF;
 RETURN public.event_competition_formats_base(action,payload);
END $$;
REVOKE ALL ON FUNCTION public.event_competition(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_competition(text,jsonb) TO authenticated;
ALTER FUNCTION public.event_public(uuid,text) RENAME TO event_public_formats_base;
REVOKE ALL ON FUNCTION public.event_public_formats_base(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_public(aid uuid,code text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.event_public_formats_base(aid,code);
 IF result IS NULL THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.event_seeds WHERE activity_id=aid) THEN
  result:=result||jsonb_build_object('standings',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY group_number,points DESC,buchholz DESC,difference DESC,scored DESC,seed) FROM public.competition_scoreboard(aid) s),'[]'),
   'byes',COALESCE((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('name',COALESCE(NULLIF(r.team_name,''),p.name)) ORDER BY b.round) FROM public.event_byes b JOIN public.registrations r ON r.id=b.registration_id JOIN public.profiles p ON p.id=r.user_id WHERE b.activity_id=aid),'[]'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_public(uuid,text) TO anon,authenticated;
