ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','moderator')) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND account_status='active');
$$;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
CREATE POLICY staff_read ON public.activities FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_read ON public.registrations FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_read ON public.payment_status_history FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_read ON public.disputes FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_read ON public.manager_applications FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_read ON public.transactions FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_read ON public.content_blocks FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY staff_update ON public.activities FOR UPDATE TO authenticated USING(public.is_staff()) WITH CHECK(public.is_staff());
CREATE POLICY staff_update ON public.registrations FOR UPDATE TO authenticated USING(public.is_staff()) WITH CHECK(public.is_staff());
CREATE POLICY staff_update ON public.disputes FOR UPDATE TO authenticated USING(public.is_staff()) WITH CHECK(public.is_staff());
CREATE POLICY staff_update ON public.manager_applications FOR UPDATE TO authenticated USING(public.is_staff()) WITH CHECK(public.is_staff());
CREATE POLICY staff_update ON public.content_blocks FOR UPDATE TO authenticated USING(public.is_staff()) WITH CHECK(public.is_staff());
CREATE POLICY staff_insert ON public.content_blocks FOR INSERT TO authenticated WITH CHECK(public.is_staff());
CREATE POLICY staff_delete ON public.content_blocks FOR DELETE TO authenticated USING(public.is_staff());
CREATE POLICY staff_applicant_profiles ON public.profiles FOR SELECT TO authenticated USING(public.is_staff() AND EXISTS(SELECT 1 FROM public.manager_applications m WHERE m.user_id=profiles.id));
CREATE POLICY staff_audit_insert ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK(public.is_staff() AND actor_id=auth.uid());
ALTER TABLE public.admin_audit_log ADD COLUMN actor_role text;
CREATE FUNCTION public.staff_audit_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN NEW.actor_role:=CASE WHEN public.is_admin() THEN 'admin' WHEN public.is_staff() THEN 'moderator' ELSE 'system' END; RETURN NEW; END $$;
CREATE TRIGGER staff_audit_role BEFORE INSERT ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public.staff_audit_role();
CREATE FUNCTION public.audit_staff_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.is_staff() THEN INSERT INTO public.admin_audit_log(actor_id,action,entity,entity_id,payload) VALUES(auth.uid(),lower(TG_OP),TG_TABLE_NAME,COALESCE(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'),jsonb_build_object('operation',TG_OP)); END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER audit_staff_mutation AFTER INSERT OR UPDATE OR DELETE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.audit_staff_mutation();
CREATE TRIGGER audit_staff_mutation AFTER INSERT OR UPDATE OR DELETE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.audit_staff_mutation();
CREATE TRIGGER audit_staff_mutation AFTER INSERT OR UPDATE OR DELETE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.audit_staff_mutation();
CREATE TRIGGER audit_staff_mutation AFTER INSERT OR UPDATE OR DELETE ON public.manager_applications FOR EACH ROW EXECUTE FUNCTION public.audit_staff_mutation();
CREATE TRIGGER audit_staff_mutation AFTER INSERT OR UPDATE OR DELETE ON public.content_blocks FOR EACH ROW EXECUTE FUNCTION public.audit_staff_mutation();
CREATE OR REPLACE FUNCTION public.guard_registration_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE free_game boolean;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.activity_id<>OLD.activity_id OR NEW.user_id<>OLD.user_id OR NEW.amount_due IS DISTINCT FROM OLD.amount_due OR NEW.terms_snapshot IS DISTINCT FROM OLD.terms_snapshot) THEN RAISE EXCEPTION 'Условия существующей записи неизменны'; END IF;
 IF auth.uid() IS NULL OR public.is_staff() OR public.is_activity_host(NEW.activity_id,auth.uid()) THEN RETURN NEW; END IF;
 IF NEW.user_id<>auth.uid() THEN RAISE EXCEPTION 'Запись недоступна'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT is_free INTO free_game FROM public.activities WHERE id=NEW.activity_id;
  IF NEW.status<>'registered' OR NEW.payment_status<>(CASE WHEN free_game THEN 'paid'::public.payment_status ELSE 'pending'::public.payment_status END) OR NEW.paid_at IS NOT NULL OR NEW.confirmed_at IS NOT NULL OR NEW.confirmed_by IS NOT NULL THEN RAISE EXCEPTION 'Некорректный статус новой записи'; END IF;
 ELSE
  IF OLD.status='registered' AND NEW.status='cancelled' AND EXISTS(SELECT 1 FROM public.activities WHERE id=NEW.activity_id AND (date_time<=now() OR status IN ('cancelled','completed'))) THEN RAISE EXCEPTION 'Отмена после начала рассматривается через поддержку'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('cancelled','rejected') AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=NEW.activity_id) THEN RAISE EXCEPTION 'Состав соревнования зафиксирован. Изменение требует поддержки'; END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR NEW.payment_note IS DISTINCT FROM OLD.payment_note THEN RAISE EXCEPTION 'Подтверждение доступно организатору'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='registered' AND NEW.status='cancelled') AND NOT(OLD.status='cancelled' AND NEW.status='registered' AND OLD.payment_status<>'refunded' AND NOT EXISTS(SELECT 1 FROM public.refund_requests WHERE registration_id=OLD.id AND status<>'rejected')) THEN RAISE EXCEPTION 'Отметку участия меняет организатор'; END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NOT(OLD.payment_status IN ('pending','rejected','needs_review') AND NEW.payment_status='needs_review' AND OLD.status='registered') THEN RAISE EXCEPTION 'Статус оплаты меняет организатор'; END IF;
  NEW.cancelled_at:=OLD.cancelled_at;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.staff_review_application(aid uuid,approve boolean,notes text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.manager_applications;
BEGIN
 IF NOT public.is_staff() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;
 SELECT * INTO a FROM public.manager_applications WHERE id=aid FOR UPDATE;
 IF a.id IS NULL OR a.status<>'pending' THEN RAISE EXCEPTION 'Заявка уже рассмотрена или не найдена'; END IF;
 IF a.requested_role NOT IN ('sports_manager','tournament_organizer') THEN RAISE EXCEPTION 'Недопустимая роль'; END IF;
 UPDATE public.manager_applications SET status=CASE WHEN approve THEN 'approved'::public.application_status ELSE 'rejected'::public.application_status END,admin_notes=left(notes,600),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=aid;
 IF approve THEN INSERT INTO public.user_roles(user_id,role) VALUES(a.user_id,a.requested_role) ON CONFLICT DO NOTHING; END IF;
END $$;
REVOKE ALL ON FUNCTION public.staff_review_application(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_review_application(uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.guard_staff_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.is_staff() AND NOT public.is_admin() THEN
  IF TG_TABLE_NAME='activities' AND (NEW.commission_percent IS DISTINCT FROM OLD.commission_percent OR NEW.manager_id IS DISTINCT FROM OLD.manager_id OR NEW.organizer_id IS DISTINCT FROM OLD.organizer_id) THEN RAISE EXCEPTION 'Только администратор может менять комиссию и владельца'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_staff_scope BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_staff_scope();
CREATE FUNCTION public.staff_payment(rid uuid,approve boolean,note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_staff() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;
 IF NOT approve AND length(trim(COALESCE(note,'')))<3 THEN RAISE EXCEPTION 'Укажите причину отклонения'; END IF;
 PERFORM 1 FROM public.registrations WHERE id=rid AND payment_status='needs_review' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Платёж уже рассмотрен или не найден'; END IF;
 UPDATE public.registrations SET payment_status=CASE WHEN approve THEN 'paid'::public.payment_status ELSE 'rejected'::public.payment_status END,paid_at=CASE WHEN approve THEN now() ELSE NULL END,confirmed_at=now(),confirmed_by=auth.uid(),payment_note=left(note,600) WHERE id=rid;
END $$;
REVOKE ALL ON FUNCTION public.staff_payment(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_payment(uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.staff_overview_counts() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_staff() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;
 RETURN jsonb_build_object('total',(SELECT count(*) FROM public.profiles),'flagged',(SELECT count(*) FROM public.profiles WHERE account_status<>'active'));
END $$;
REVOKE ALL ON FUNCTION public.staff_overview_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_overview_counts() TO authenticated;
CREATE POLICY staff_receipts ON storage.objects FOR SELECT TO authenticated USING(bucket_id='receipts' AND public.is_staff());
