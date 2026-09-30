-- Prepare the two paid tournament formats without opening payment collection.
-- Paid competitions remain unpublishable until Sportura has a payment provider.
ALTER TABLE public.activities DROP CONSTRAINT activities_tier_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_tier_check
 CHECK(tier IN ('spark','blitz','marathon'));

CREATE FUNCTION public.guard_unpublished_paid_tier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.tier IN ('blitz','marathon') THEN
  RAISE EXCEPTION 'Платный турнир нельзя опубликовать без платёжного провайдера Sportura';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_unpublished_paid_tier BEFORE INSERT OR UPDATE OF tier ON public.activities
 FOR EACH ROW EXECUTE FUNCTION public.guard_unpublished_paid_tier();

ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_lifecycle_base;
REVOKE ALL ON FUNCTION public.event_workspace_lifecycle_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); d jsonb; fee numeric; minutes integer; tier_name text;
 doc public.host_documents; doc_id uuid; result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF octet_length(payload::text)>40000 THEN RAISE EXCEPTION 'Слишком много данных'; END IF;
 IF action='document' AND payload->'data' IS NOT NULL THEN
  d:=payload->'data'; fee:=COALESCE((d->>'entry_fee')::numeric,0);
  IF fee=0 AND d->>'tier' IN ('blitz','marathon') THEN
   RAISE EXCEPTION 'Blitz и Marathon требуют взнос и пока доступны только как черновик';
  END IF;
  IF fee>0 THEN
   IF payload->>'kind'<>'draft' OR d->>'type'<>'tournament'
    OR NOT public.has_role(u,'tournament_organizer') AND NOT public.is_admin()
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active')
    THEN RAISE EXCEPTION 'Черновик платного турнира доступен организатору турниров'; END IF;
   tier_name:=d->>'tier'; minutes:=(d->>'duration_minutes')::integer;
   IF NOT EXISTS(SELECT 1 FROM public.disciplines WHERE name=d->>'sport' AND kind='sport')
    OR fee>100000 OR COALESCE(d->>'kaspi_payment_link','')<>''
    OR NOT((tier_name='blitz' AND minutes BETWEEN 15 AND 1440)
      OR (tier_name='marathon' AND minutes BETWEEN 1441 AND 10080))
    THEN RAISE EXCEPTION 'Проверьте спортивную дисциплину, взнос и длительность турнира'; END IF;
   IF length(COALESCE(payload->>'name',''))>120 OR length(d::text)>30000
    THEN RAISE EXCEPTION 'Черновик слишком большой'; END IF;
   doc_id:=COALESCE(NULLIF(payload->>'id','')::uuid,gen_random_uuid());
   SELECT * INTO doc FROM public.host_documents WHERE id=doc_id FOR UPDATE;
   IF doc.id IS NOT NULL AND (doc.user_id<>u OR doc.kind<>'draft' OR doc.published_id IS NOT NULL)
    THEN RAISE EXCEPTION 'Черновик недоступен'; END IF;
   IF doc.id IS NOT NULL AND payload ? 'version'
    AND (payload->>'version')::timestamptz<>doc.updated_at
    THEN RAISE EXCEPTION 'Черновик изменён на другом устройстве. Обновите страницу'; END IF;
   IF NULLIF(payload->>'activity_id','') IS NOT NULL THEN
    RAISE EXCEPTION 'Опубликованное событие нельзя превратить в платный черновик';
   END IF;
   INSERT INTO public.host_documents(id,user_id,kind,name,data)
    VALUES(doc_id,u,'draft',left(COALESCE(payload->>'name','Новый турнир'),120),d)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,data=EXCLUDED.data,updated_at=clock_timestamp()
    RETURNING * INTO doc;
   RETURN to_jsonb(doc);
  END IF;
 END IF;
 IF action='publish' THEN
  SELECT * INTO doc FROM public.host_documents
   WHERE id=NULLIF(payload->>'id','')::uuid AND user_id=u;
  IF doc.id IS NOT NULL AND COALESCE((doc.data->>'entry_fee')::numeric,0)>0 THEN
   RAISE EXCEPTION 'Платные турниры пока можно сохранить только как черновик. Платёжный провайдер Sportura ещё не подключён';
  END IF;
 END IF;
 result:=public.event_workspace_lifecycle_base(action,payload);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;
