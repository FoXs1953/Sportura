ALTER TABLE public.disciplines ADD COLUMN config_schema jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.activities ADD COLUMN match_settings jsonb NOT NULL DEFAULT '{}';
UPDATE public.disciplines SET config_schema='[{"key":"half_minutes","label":"Минут в тайме","type":"number","min":10,"max":45,"default":"45"},{"key":"substitutions","label":"Обратные замены","type":"select","options":["Да","Нет"],"default":"Да"}]' WHERE id='football';
UPDATE public.disciplines SET config_schema='[{"key":"half_minutes","label":"Минут в тайме","type":"number","min":10,"max":20,"default":"20"},{"key":"court","label":"Площадка","type":"select","options":["Зал","Открытая"],"default":"Зал"}]' WHERE id='futsal';
UPDATE public.disciplines SET config_schema='[{"key":"period_minutes","label":"Минут в периоде","type":"number","min":5,"max":20,"default":"10"},{"key":"overtime","label":"Овертайм, минут","type":"number","min":1,"max":10,"default":"5"}]' WHERE id='basketball';
UPDATE public.disciplines SET config_schema='[{"key":"minutes","label":"Длительность, минут","type":"number","min":5,"max":15,"default":"10"},{"key":"target","label":"До скольких очков","type":"number","min":11,"max":31,"default":"21"}]' WHERE id='basketball3';
UPDATE public.disciplines SET config_schema='[{"key":"series","label":"Серия матчей","type":"select","options":["BO1","BO3","BO5"],"default":"BO3"},{"key":"set_points","label":"Очков в сете","type":"number","min":15,"max":25,"default":"25"}]' WHERE id='volleyball';
UPDATE public.disciplines SET config_schema='[{"key":"series","label":"Серия матчей","type":"select","options":["BO1","BO3","BO5"],"default":"BO3"},{"key":"set_points","label":"Очков в сете","type":"number","min":15,"max":25,"default":"21"}]' WHERE id='beach';
UPDATE public.disciplines SET config_schema='[{"key":"series","label":"Серия матчей","type":"select","options":["BO1","BO3","BO5"],"default":"BO3"},{"key":"region","label":"Регион сервера","type":"text","default":"Казахстан / Центральная Азия"},{"key":"maps","label":"Пул карт и порядок вето","type":"text","default":"Уточнить в регламенте"},{"key":"anticheat","label":"Античит","type":"select","options":["FACEIT","Официальный"],"default":"FACEIT"}]' WHERE id='cs2';
UPDATE public.disciplines SET config_schema='[{"key":"series","label":"Серия матчей","type":"select","options":["BO1","BO3","BO5"],"default":"BO3"},{"key":"region","label":"Регион сервера","type":"text","default":"Казахстан / Центральная Азия"},{"key":"mode","label":"Режим","type":"select","options":["Captains Mode"],"default":"Captains Mode"}]' WHERE id='dota2';
UPDATE public.disciplines SET config_schema='[{"key":"region","label":"Регион сервера","type":"text","default":"Казахстан / Центральная Азия"},{"key":"matches","label":"Число матчей","type":"number","min":1,"max":12,"default":"6"},{"key":"scoring","label":"Очки за место и киллы","type":"text","default":"Уточнить в регламенте"}]' WHERE id='pubgm';
UPDATE public.disciplines SET config_schema='[{"key":"series","label":"Серия матчей","type":"select","options":["BO1","BO3","BO5"],"default":"BO3"},{"key":"region","label":"Регион сервера","type":"text","default":"Казахстан / Центральная Азия"},{"key":"mode","label":"Режим","type":"select","options":["Draft Pick"],"default":"Draft Pick"}]' WHERE id='mlbb';
UPDATE public.disciplines SET config_schema='[{"key":"platform","label":"Платформа","type":"select","options":["PS","Xbox","PC"],"default":"PS"},{"key":"crossplay","label":"Кроссплей","type":"select","options":["Да","Нет"],"default":"Нет"},{"key":"half_minutes","label":"Минут в тайме","type":"number","min":3,"max":15,"default":"6"},{"key":"squads","label":"Допустимые составы","type":"text","default":"Клубы"}]' WHERE id='eafc';
CREATE FUNCTION public.validate_match_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE field jsonb; v text; config jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.match_settings=OLD.match_settings AND NEW.discipline_id IS NOT DISTINCT FROM OLD.discipline_id THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=OLD.id) THEN RAISE EXCEPTION 'Настройки матча зафиксированы после регистрации'; END IF;
 SELECT config_schema INTO config FROM public.disciplines WHERE id=NEW.discipline_id;
 IF jsonb_typeof(NEW.match_settings)<>'object' OR length(NEW.match_settings::text)>5000 THEN RAISE EXCEPTION 'Некорректные настройки'; END IF;
 FOR field IN SELECT * FROM jsonb_array_elements(COALESCE(config,'[]')) LOOP
  v:=COALESCE(NEW.match_settings->>(field->>'key'),field->>'default');
  IF length(v)>300 OR length(trim(v))=0 OR (field->>'type'='select' AND NOT(field->'options' ? v)) THEN RAISE EXCEPTION 'Проверьте поле: %',field->>'label'; END IF;
  IF field->>'type'='number' AND (v !~ '^[0-9]+$' OR v::numeric<(field->>'min')::numeric OR v::numeric>(field->>'max')::numeric) THEN RAISE EXCEPTION 'Проверьте число: %',field->>'label'; END IF;
  NEW.match_settings:=jsonb_set(NEW.match_settings,ARRAY[field->>'key'],to_jsonb(v));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.match_settings) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(config,'[]')) f WHERE f->>'key'=k)) THEN RAISE EXCEPTION 'Неизвестное поле настройки'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_match_settings BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.validate_match_settings();
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.event_workspace(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'UPDATE public.activities SET discipline_id=', 'UPDATE public.activities SET match_settings=COALESCE(vals->''match_settings'',''{}''),discipline_id=');
 EXECUTE definition;
END $$;
