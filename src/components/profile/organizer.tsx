import { useState } from "react";
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
import {
  Panel,
  SaveRow,
  ErrorNotice,
  useProfileForm,
  useSectionForm,
  dateLabel,
} from "./shared";
export function OrganizerTab({
  me,
  data,
}: {
  me: MyProfile;
  data: ProfileWorkspace;
}) {
  const [review, setReview] = useState(false);
  const roles = ["sports_manager", "tournament_organizer"] as const;
  const available = roles.filter(
    (r) => !me.roles.includes(r) && !me.roles.includes("admin"),
  );
  const pending = data.applications.some((a) => a.status === "pending");
  const isHost =
    roles.some((r) => me.roles.includes(r)) || me.roles.includes("admin");
  const form = useProfileForm(
    "application",
    {
      role: available[0] ?? "sports_manager",
      sports: me.sports,
      city: me.city,
      venues: "",
      experience: "",
      frequency: "Еженедельно",
    },
    (v) =>
      applyForHostRole({
        data: {
          requested_role: v.role,
          motivation: `Город: ${v.city}\nСпорт: ${v.sports.join(", ")}\nПлощадки: ${v.venues}\nОпыт: ${v.experience}\nЧастота: ${v.frequency}`,
        },
      }),
  );
  const host = useSectionForm(
    "host",
    {
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
  return (
    <>
      <Panel
        title="Роль организатора"
        subtitle="Создавайте события, собирайте команды и управляйте участниками."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="workspace-panel-raised p-4">
            <h3 className="text-sm font-bold">Спорт-менеджер</h3>
            <p className="workspace-muted mt-2 text-sm">
              Проводит игры, управляет составом и отмечает посещаемость.
            </p>
          </div>
          <div className="workspace-panel-raised p-4">
            <h3 className="text-sm font-bold">Организатор турниров</h3>
            <p className="workspace-muted mt-2 text-sm">
              Создаёт турниры и лиги, публикует результаты и управляет
              соревнованиями.
            </p>
          </div>
        </div>
        <ul className="mt-5 grid gap-2 text-sm">
          {requirements.map((r) => (
            <li
              key={r.label}
              className={r.done ? "text-[#9ed9a2]" : "text-[#e9c67f]"}
            >
              {r.done ? "✓" : "○"} {r.label}
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="mt-5">
            <span className="workspace-tag is-success">Роль одобрена</span>
            <p className="workspace-muted mt-2 text-xs">
              {me.roles
                .filter((r) => roles.includes(r as (typeof roles)[number]))
                .map((r) => ROLE_LABEL[r])
                .join(", ") || "Доступ администратора"}
              . Одобрение роли не означает проверку документов личности.
            </p>
            <Link className="workspace-primary-link mt-4" to="/host">
              Перейти в кабинет →
            </Link>
          </div>
        )}
      </Panel>
      {isHost && (
        <Panel title="Публичные данные организатора">
          <div className="space-y-4">
            <label>
              Название организатора
              <Input
                maxLength={80}
                value={host.value.host_name}
                onChange={(e) => host.patch({ host_name: e.target.value })}
              />
            </label>
            <label>
              Об организаторе
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
            Публичная страница организатора ↗
          </Link>
        </Panel>
      )}
      {available.length > 0 && !pending && (
        <Panel
          title={isHost ? "Получить дополнительную роль" : "Заявка на роль"}
        >
          <div className="space-y-5">
            <label>
              Роль
              <select
                value={form.value.role}
                onChange={(e) =>
                  form.patch({ role: e.target.value as typeof form.value.role })
                }
              >
                {available.map((role) => (
                  <option value={role} key={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Город
              <Input
                value={form.value.city}
                maxLength={60}
                onChange={(e) => form.patch({ city: e.target.value })}
              />
            </label>
            <div>
              <h3 className="mb-3 text-sm font-bold">Виды спорта</h3>
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
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Площадки
              <Input
                maxLength={200}
                value={form.value.venues}
                onChange={(e) => form.patch({ venues: e.target.value })}
                placeholder="Название и адрес или район"
              />
            </label>
            <label>
              Опыт проведения событий
              <Textarea
                rows={4}
                maxLength={500}
                value={form.value.experience}
                onChange={(e) => form.patch({ experience: e.target.value })}
              />
            </label>
            <label>
              Как часто планируете проводить?
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
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {!canApply && (
              <p className="text-sm text-[#e9c67f]">
                Перед отправкой выполните условия выше в разделе личных данных.
              </p>
            )}
            <ErrorNotice message={form.error} />
            <Button
              disabled={
                !canApply ||
                form.busy ||
                form.value.venues.trim().length < 3 ||
                form.value.experience.trim().length < 10 ||
                !form.value.sports.length ||
                !form.value.city.trim()
              }
              onClick={() => setReview(true)}
            >
              Проверить заявку
            </Button>
          </div>
          <Dialog open={review} onOpenChange={setReview}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Проверка заявки</DialogTitle>
                <DialogDescription>
                  Эти сведения получит администратор Sportura.
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="workspace-muted">Роль</dt>
                  <dd>{ROLE_LABEL[form.value.role]}</dd>
                </div>
                <div>
                  <dt className="workspace-muted">Город и спорт</dt>
                  <dd>
                    {form.value.city} · {form.value.sports.join(", ")}
                  </dd>
                </div>
                <div>
                  <dt className="workspace-muted">Площадки и частота</dt>
                  <dd>
                    {form.value.venues} · {form.value.frequency}
                  </dd>
                </div>
                <div>
                  <dt className="workspace-muted">Опыт</dt>
                  <dd className="whitespace-pre-wrap">
                    {form.value.experience}
                  </dd>
                </div>
              </dl>
              <ErrorNotice message={form.error} />
              <Button
                disabled={form.busy}
                onClick={async () => {
                  if (await form.submit()) setReview(false);
                }}
              >
                {form.busy ? "Отправляем…" : "Отправить заявку"}
              </Button>
            </DialogContent>
          </Dialog>
        </Panel>
      )}
      <Panel title="История заявок">
        {data.applications.length ? (
          data.applications.map((a) => (
            <article className="profile-item" key={a.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <strong className="text-sm">
                  {ROLE_LABEL[a.requested_role]}
                </strong>
                <span
                  className={`workspace-tag ${a.status === "approved" ? "is-success" : a.status === "pending" ? "is-warning" : ""}`}
                >
                  {
                    {
                      pending: "На рассмотрении",
                      approved: "Одобрена",
                      rejected: "Отклонена",
                    }[a.status]
                  }
                </span>
              </div>
              <p className="workspace-muted mt-2 text-xs">
                {dateLabel(a.created_at, true)}
              </p>
              {a.motivation && (
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {a.motivation}
                </p>
              )}
              {a.admin_notes && (
                <p className="workspace-panel-raised mt-3 rounded-xl p-3 text-sm">
                  Комментарий администратора: {a.admin_notes}
                </p>
              )}
            </article>
          ))
        ) : (
          <p className="workspace-muted text-sm">
            Вы ещё не отправляли заявки.
          </p>
        )}
      </Panel>
    </>
  );
}
