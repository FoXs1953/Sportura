import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyForHostRole, type MyProfile } from "@/lib/me.functions";
import { type ProfileWorkspace } from "@/lib/profile-model";
import { ROLE_LABEL, SPORTS } from "@/lib/sportura";
import { clearDraft, draftKey, loadDraft, saveDraft } from "@/lib/form-draft";

const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;
import {
  Panel,
  SaveRow,
  ErrorNotice,
  useProfileForm,
  useSectionForm,
  dateLabel,
  organizerApplicationLabel,
} from "./shared";
export function OrganizerTab({
  me,
  data,
}: {
  me: MyProfile;
  data: ProfileWorkspace;
}) {
  const { tr, language } = useI18n();
  const [review, setReview] = useState(false);
  const roles = ["sports_manager", "tournament_organizer"] as const;
  const available = roles.filter(
    (r) => !me.roles.includes(r) && !me.roles.includes("admin"),
  );
  const pending = data.applications.some((a) => a.status === "pending");
  const isHost =
    roles.some((r) => me.roles.includes(r)) || me.roles.includes("admin");
  const blank = {
    role: available[0] ?? "sports_manager",
    sports: me.sports,
    city: me.city,
    venues: "",
    experience: "",
    links: "",
    frequency: "Еженедельно",
  };
  const draft = draftKey("organizer-application", me.id);
  const form = useProfileForm(
    "application",
    blank,
    async (v) => {
      await applyForHostRole({
        data: {
          requested_role: v.role,
          motivation: `Город: ${v.city}\nСпорт: ${v.sports.join(", ")}\nПлощадки: ${v.venues}\nОпыт: ${v.experience}\nСсылки: ${v.links}\nЧастота: ${v.frequency}`,
        },
      });
      clearDraft(draft);
    },
    false,
  );
  // The draft is restored after mount: storage exists only in the browser.
  const restored = useRef(false);
  const { setValue } = form;
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadDraft<typeof blank>(draft, DRAFT_MAX_AGE);
    if (!saved) return;
    setValue((current) => ({
      ...current,
      ...saved,
      role: available.includes(saved.role) ? saved.role : current.role,
      sports: Array.isArray(saved.sports)
        ? saved.sports.filter((s) => (SPORTS as readonly string[]).includes(s))
        : current.sports,
    }));
  }, [available, draft, setValue]);
  const blankKey = JSON.stringify(blank);
  const valueKey = JSON.stringify(form.value);
  useEffect(() => {
    if (!restored.current || pending) return;
    // Every edit restarts the 24-hour expiry; an untouched form keeps no draft.
    if (valueKey === blankKey) clearDraft(draft);
    else saveDraft(draft, JSON.parse(valueKey));
  }, [blankKey, draft, pending, valueKey]);
  const host = useSectionForm(
    "host",
    {
      host_contact: data.preferences.host_contact ?? "",
      host_name: data.preferences.host_name,
      host_bio: data.preferences.host_bio,
      kaspi: me.kaspi_payment_link ?? "",
    },
    "host",
  );
  const requirements = [
    { done: me.name.trim().length >= 2, label: "Имя заполнено" },
    { done: !!me.phone, label: "Телефон указан" },
    {
      done: data.email_confirmed || data.phone_confirmed,
      label: "Контакт подтверждён",
    },
    { done: me.account_status === "active", label: "Аккаунт активен" },
  ];
  const canApply = requirements.every((r) => r.done) && !pending;
  const missingFields = [
    { done: !!form.value.city.trim(), label: "город" },
    { done: form.value.sports.length > 0, label: "хотя бы один вид спорта" },
    {
      done: form.value.venues.trim().length >= 3,
      label: "площадки — минимум 3 символа",
    },
    {
      done: form.value.experience.trim().length >= 10,
      label: "опыт — минимум 10 символов",
    },
  ].filter((field) => !field.done);
  return (
    <>
      <Panel
        title={tr("Роль организатора")}
        subtitle={tr(
          "Создавайте события, собирайте команды и управляйте участниками.",
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="workspace-panel-raised p-4">
            <h3 className="text-sm font-bold">{tr("Спорт-менеджер")}</h3>
            <p className="workspace-muted mt-2 text-sm">
              {tr("Проводит игры, управляет составом и отмечает посещаемость.")}
            </p>
          </div>
          <div className="workspace-panel-raised p-4">
            <h3 className="text-sm font-bold">{tr("Организатор турниров")}</h3>
            <p className="workspace-muted mt-2 text-sm">
              {tr(
                "Создаёт турниры и лиги, публикует результаты и управляет соревнованиями.",
              )}
            </p>
          </div>
        </div>
        <ul className="mt-5 grid gap-2 text-sm">
          {requirements.map((r) => (
            <li
              key={r.label}
              className={r.done ? "text-success" : "text-warning"}
            >
              {tr(r.done ? "✓" : "○")} {tr(r.label)}
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="mt-5">
            <span className="workspace-tag is-success">
              {tr("Роль одобрена")}
            </span>
            <p className="workspace-muted mt-2 text-xs">
              {tr(
                me.roles
                  .filter((r) => roles.includes(r as (typeof roles)[number]))
                  .map((r) => tr(ROLE_LABEL[r]))
                  .join(", ") || "Доступ администратора",
              )}
              {tr(". Одобрение роли не означает проверку документов личности.")}
            </p>
            <Link className="workspace-primary-link mt-4" to="/host">
              {tr("Перейти в кабинет →")}
            </Link>
          </div>
        )}
      </Panel>
      {isHost && (
        <Panel title={tr("Публичные данные организатора")}>
          <div className="space-y-4">
            <label>
              {tr("Название организатора")}
              <Input
                maxLength={80}
                value={host.value.host_name}
                onChange={(e) => host.patch({ host_name: e.target.value })}
              />
            </label>
            <label>
              {tr("Публичная ссылка Telegram")}
              <Input
                value={host.value.host_contact}
                maxLength={120}
                onChange={(e) => host.patch({ host_contact: e.target.value })}
                placeholder={tr("https://t.me/your_name")}
              />
            </label>
            <label>
              {tr("Об организаторе")}
              <Textarea
                rows={4}
                maxLength={1000}
                value={host.value.host_bio}
                onChange={(e) => host.patch({ host_bio: e.target.value })}
              />
            </label>
          </div>
          <SaveRow form={host} />
          <Link
            className="profile-link mt-4 inline-block"
            to="/organizer/$id"
            params={{ id: me.id }}
          >
            {tr("Публичная страница организатора ↗")}
          </Link>
        </Panel>
      )}
      {available.length > 0 && !pending && (
        <Panel
          title={tr(isHost ? "Получить дополнительную роль" : "Заявка на роль")}
        >
          <div className="space-y-5">
            <label>
              {tr("Роль")}
              <select
                value={form.value.role}
                onChange={(e) =>
                  form.patch({ role: e.target.value as typeof form.value.role })
                }
              >
                {available.map((role) => (
                  <option value={role} key={role}>
                    {tr(ROLE_LABEL[role])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Город (обязательно)")}
              <Input
                value={form.value.city}
                maxLength={60}
                required
                onChange={(e) => form.patch({ city: e.target.value })}
              />
            </label>
            <div>
              <h3 className="text-sm font-bold">
                {tr("Виды спорта (обязательно)")}
              </h3>
              <p className="workspace-muted mb-3 mt-1 text-xs">
                {tr("Выберите хотя бы один вид спорта.")}
              </p>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((s) => (
                  <button
                    className={`feed-chip ${form.value.sports.includes(s) ? "is-active" : ""}`}
                    key={s}
                    aria-pressed={form.value.sports.includes(s)}
                    onClick={() =>
                      form.patch({
                        sports: form.value.sports.includes(s)
                          ? form.value.sports.filter((v) => v !== s)
                          : [...form.value.sports, s],
                      })
                    }
                  >
                    {tr(s)}
                  </button>
                ))}
              </div>
            </div>
            <label>
              {tr("Площадки (обязательно)")}
              <Input
                maxLength={200}
                minLength={3}
                required
                aria-describedby="organizer-venues-hint"
                value={form.value.venues}
                onChange={(e) => form.patch({ venues: e.target.value })}
                placeholder={tr("Название и адрес или район")}
              />
              <span
                id="organizer-venues-hint"
                className="workspace-muted mt-1 block text-xs"
              >
                {tr("Минимум 3 символа.")}
              </span>
            </label>
            <label>
              {tr("Опыт проведения событий (обязательно)")}
              <Textarea
                rows={4}
                maxLength={500}
                minLength={10}
                required
                aria-describedby="organizer-experience-hint"
                value={form.value.experience}
                onChange={(e) => form.patch({ experience: e.target.value })}
              />
              <span
                id="organizer-experience-hint"
                className="workspace-muted mt-1 block text-xs"
              >
                {tr(
                  "Минимум 10 символов. Расскажите о проведённых событиях или планах, если это ваш первый опыт.",
                )}
              </span>
            </label>
            <label>
              {tr("Публичный профиль или канал (необязательно)")}
              <Input
                value={form.value.links}
                maxLength={300}
                onChange={(e) => form.patch({ links: e.target.value })}
                placeholder={tr("Ссылка на ваши прошлые события")}
              />
            </label>
            <label>
              {tr("Как часто планируете проводить?")}
              <select
                value={form.value.frequency}
                onChange={(e) => form.patch({ frequency: e.target.value })}
              >
                {[
                  "Еженедельно",
                  "Несколько раз в неделю",
                  "Ежемесячно",
                  "Разовое событие",
                ].map((v) => (
                  <option key={v} value={v}>
                    {tr(v)}
                  </option>
                ))}
              </select>
            </label>
            {!canApply && (
              <div className="text-sm text-warning">
                <p>
                  {tr(
                    "Перед отправкой выполните условия выше в разделе личных данных.",
                  )}
                </p>
                <Link
                  className="profile-link mt-2 inline-block"
                  to="/profile"
                  search={{ tab: "personal" }}
                >
                  {tr("Перейти к личным данным →")}
                </Link>
              </div>
            )}
            <p className="workspace-muted text-xs">
              {tr(
                "Черновик заявки сохраняется на этом устройстве на 24 часа. Можно перейти в другой раздел и вернуться.",
              )}
            </p>
            <ErrorNotice message={tr(form.error)} />
            {missingFields.length > 0 && (
              <p className="text-sm text-warning" aria-live="polite">
                {tr("Чтобы проверить заявку, заполните:")}{" "}
                {missingFields.map((field) => tr(field.label)).join("; ")}.
              </p>
            )}
            <Button
              disabled={!canApply || form.busy || missingFields.length > 0}
              onClick={() => setReview(true)}
            >
              {tr("Проверить заявку")}
            </Button>
          </div>
          <Dialog open={review} onOpenChange={setReview}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tr("Проверка заявки")}</DialogTitle>
                <DialogDescription>
                  {tr("Эти сведения получит администратор Sportura.")}
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="workspace-muted">{tr("Роль")}</dt>
                  <dd>{tr(ROLE_LABEL[form.value.role])}</dd>
                </div>
                <div>
                  <dt className="workspace-muted">{tr("Город и спорт")}</dt>
                  <dd>
                    {tr(form.value.city)} ·{" "}
                    {form.value.sports.map((sport) => tr(sport)).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt className="workspace-muted">
                    {tr("Площадки и частота")}
                  </dt>
                  <dd>
                    {tr(form.value.venues)} · {tr(form.value.frequency)}
                  </dd>
                </div>
                <div>
                  <dt className="workspace-muted">{tr("Опыт")}</dt>
                  <dd className="whitespace-pre-wrap">
                    {tr(form.value.experience)}
                  </dd>
                </div>
              </dl>
              <ErrorNotice message={tr(form.error)} />
              <Button
                disabled={form.busy}
                onClick={async () => {
                  if (await form.submit()) setReview(false);
                }}
              >
                {tr(form.busy ? "Отправляем…" : "Отправить заявку")}
              </Button>
            </DialogContent>
          </Dialog>
        </Panel>
      )}
      <Panel title={tr("История заявок")}>
        {data.applications.length ? (
          data.applications.map((a) => (
            <article className="profile-item" key={a.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <strong className="text-sm">
                  {tr(ROLE_LABEL[a.requested_role])}
                </strong>
                <span
                  className={`workspace-tag ${a.status === "approved" ? "is-success" : a.status === "pending" ? "is-warning" : ""}`}
                >
                  {tr(
                    {
                      pending: "На рассмотрении",
                      approved: "Одобрена",
                      rejected: "Отклонена",
                    }[a.status],
                  )}
                </span>
              </div>
              <p className="workspace-muted mt-2 text-xs">
                {tr(dateLabel(a.created_at, true, language))}
              </p>
              {tr(
                a.motivation && (
                  <p className="mt-3 whitespace-pre-wrap text-sm">
                    {organizerApplicationLabel(a.motivation, tr)}
                  </p>
                ),
              )}
              {tr(
                a.admin_notes && (
                  <p className="workspace-panel-raised mt-3 rounded-xl p-3 text-sm">
                    {tr("Комментарий администратора: ")}
                    {tr(a.admin_notes)}
                  </p>
                ),
              )}
            </article>
          ))
        ) : (
          <p className="workspace-muted text-sm">
            {tr("Вы ещё не отправляли заявки.")}
          </p>
        )}
      </Panel>
    </>
  );
}
