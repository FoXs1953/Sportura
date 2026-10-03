import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSupportAdmin, saveProfileSection } from "@/lib/profile.functions";
import {
  ticketStatuses,
  ticketTopics,
  type SupportTicket,
  type ProfileWorkspace,
} from "@/lib/profile-model";
import { signedFileUrl, SUPPORT_BUCKET } from "@/lib/storage";
import {
  Panel,
  Empty,
  ErrorNotice,
  errorText,
  dateLabel,
  useProfileForm,
} from "./shared";
export type TicketDraft = {
  topic: string;
  subject: string;
  registration_id?: string;
  activity_id?: string;
  review_id?: string;
};
export function TicketComposer({
  data,
  draft,
  onDone,
}: {
  data: ProfileWorkspace;
  draft?: TicketDraft | undefined;
  onDone?: () => void;
}) {
  const { tr, language } = useI18n();
  const qc = useQueryClient();
  const form = useProfileForm(
    "ticket",
    {
      topic: draft?.topic ?? "general",
      subject: draft?.subject ? tr(draft.subject) : "",
      registration_id: draft?.registration_id ?? "",
      activity_id: draft?.activity_id ?? "",
      review_id: draft?.review_id ?? "",
      body: "",
    },
    async (value) => {
      if (value.subject.trim().length < 3 || value.body.trim().length < 10)
        throw new Error("Укажите тему от 3 символов и описание от 10 символов");
      await saveProfileSection({ data: { action: "ticket", payload: value } });
    },
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          {tr("Тема обращения")}
          <select
            value={form.value.topic}
            onChange={(e) => form.patch({ topic: e.target.value })}
          >
            {Object.entries(ticketTopics).map(([v, label]) => (
              <option key={v} value={v}>
                {tr(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Связанная запись")}
          <select
            value={form.value.registration_id}
            onChange={(e) => form.patch({ registration_id: e.target.value })}
          >
            <option value="">{tr("Без привязки к игре")}</option>
            {data.registrations.map((r) => (
              <option key={r.id} value={r.id}>
                {tr(r.activity?.title ?? "Событие удалено")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {tr("Заголовок")}
        <Input
          value={form.value.subject}
          maxLength={120}
          onChange={(e) => form.patch({ subject: e.target.value })}
        />
      </label>
      <label>
        {tr("Что произошло?")}
        <Textarea
          value={form.value.body}
          minLength={10}
          maxLength={4000}
          rows={5}
          onChange={(e) => form.patch({ body: e.target.value })}
        />
        <small>
          {tr(
            "Опишите проблему и ожидаемое решение. Не отправляйте пароли и коды входа.",
          )}
        </small>
      </label>
      <ErrorNotice message={tr(form.error)} />
      <Button
        disabled={
          form.busy ||
          form.value.body.trim().length < 10 ||
          form.value.subject.trim().length < 3
        }
        onClick={async () => {
          if (await form.submit()) {
            form.reset({ ...form.value, body: "", subject: "" });
            await qc.invalidateQueries({ queryKey: ["support-admin"] });
            onDone?.();
          }
        }}
      >
        {tr(form.busy ? "Отправляем…" : "Отправить обращение")}
      </Button>
    </div>
  );
}
export function TicketThread({
  ticket,
  staff = false,
}: {
  ticket: SupportTicket;
  staff?: boolean;
}) {
  const { tr, language } = useI18n();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState(ticket.status);
  const [resolution, setResolution] = useState("reply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  async function send() {
    setBusy(true);
    setError("");
    try {
      await saveProfileSection({
        data: {
          action: staff ? "moderate" : "reply",
          payload: { id: ticket.id, body, status, resolution },
        },
      });
      setBody("");
      setResolution("reply");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile-workspace"] }),
        qc.invalidateQueries({ queryKey: ["support-admin"] }),
      ]);
      toast.success(tr("Ответ отправлен"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="workspace-panel-raised p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">
            №{ticket.number} · {tr(ticket.subject)}
          </h3>
          <p className="workspace-muted mt-1 text-xs">
            {tr(ticketTopics[ticket.topic])} ·{" "}
            {tr(dateLabel(ticket.created_at, false, language))}
            {tr(ticket.name ? ` · ${ticket.name}` : "")}
          </p>
        </div>
        <span className="workspace-tag">
          {tr(ticketStatuses[ticket.status])}
        </span>
      </div>
      <div className="profile-conversation">
        {ticket.messages.map((m) => (
          <div
            key={m.id}
            className={`profile-message ${m.is_staff ? "is-staff" : ""}`}
          >
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs">
              <strong>{tr(m.is_staff ? "Поддержка" : "Пользователь")}</strong>
              <time className="workspace-muted">
                {tr(dateLabel(m.created_at, true, language))}
              </time>
            </div>
            <p className="text-sm leading-relaxed">{tr(m.body)}</p>
            {m.attachments.map((path, i) => (
              <AttachmentLink key={path} path={path} index={i} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <label>
          {tr(
            ticket.status === "resolved"
              ? "Дополнить и открыть обращение снова"
              : "Ответить",
          )}
          <Textarea
            value={body}
            maxLength={4000}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        {staff && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              {tr("Статус")}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {Object.entries(ticketStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {tr(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Решение")}
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="reply">{tr("Только ответ")}</option>
                {tr(
                  ticket.topic === "attendance" && ticket.registration_id && (
                    <option value="correct_attendance">
                      {tr("Исправить на «Посетил»")}
                    </option>
                  ),
                )}
                {tr(
                  ticket.topic === "review" && ticket.review_id && (
                    <option value="remove_review">{tr("Удалить отзыв")}</option>
                  ),
                )}
              </select>
            </label>
          </div>
        )}
        <ErrorNotice message={tr(error)} />
        <Button disabled={busy || !body.trim()} onClick={() => void send()}>
          {tr(busy ? "Отправляем…" : "Отправить ответ")}
        </Button>
      </div>
    </article>
  );
}
const faq = [
  [
    "Как записаться на игру?",
    "Откройте ленту, выберите событие и нажмите «Записаться». Все записи появятся в «Мои игры».",
    "/my-games",
  ],
  [
    "Как отменить запись и вернуть деньги?",
    "Отмените запись в «Мои игры». Условия отмены указаны в карточке события.",
    "/legal",
  ],
  [
    "Что делать с неверной отметкой посещения?",
    "В разделе «Рейтинг и отзывы» выберите спорную запись и нажмите «Оспорить». Прикрепите подтверждение участия.",
    "/profile?tab=rating",
  ],
  [
    "Как стать организатором?",
    "Заполните профиль, подтвердите контакт и отправьте заявку в разделе «Роль организатора». Решение и комментарий появятся там же.",
    "/profile?tab=organizer",
  ],
  [
    "Как сменить пароль?",
    "Откройте раздел безопасности или страницу восстановления. Ссылка должна вести на sportura.kz.",
    "/forgot-password",
  ],
  [
    "Кто видит мой телефон и чеки?",
    "Контакты не публикуются. Телефон доступен организатору вашего события; чеки — вам, организатору и администратору.",
    "/legal",
  ],
];
export function HelpTab({
  data,
  draft,
  ticketId,
  onDone,
}: {
  data: ProfileWorkspace;
  draft?: TicketDraft | undefined;
  ticketId?: string;
  onDone: () => void;
}) {
  const { tr, language } = useI18n();
  const [search, setSearch] = useState("");
  const [view, setView] = useState(
    draft ? "new" : ticketId ? "tickets" : "faq",
  );
  const [selected, setSelected] = useState(ticketId ?? "");
  const selectedTicket = data.tickets.find((t) => t.id === selected);
  return (
    <>
      <Panel
        title={tr("Помощь и документы")}
        subtitle={tr("Ответы на вопросы и прямая связь с поддержкой")}
      >
        <div className="profile-tabs-row">
          {(
            [
              ["faq", "Частые вопросы"],
              ["tickets", `Мои обращения · ${data.tickets.length}`],
              ["new", "Новое обращение"],
            ] as const
          ).map(([key, label]) => (
            <button
              className={`feed-chip ${view === key ? "is-active" : ""}`}
              key={key}
              onClick={() => setView(key)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        {view === "faq" && (
          <>
            <Input
              type="search"
              aria-label={tr("Поиск по вопросам")}
              placeholder={tr("Найти ответ…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-4">
              {faq
                .filter(([q, a]) =>
                  `${tr(q)} ${tr(a)} ${q} ${a}`
                    .toLocaleLowerCase()
                    .includes(search.trim().toLocaleLowerCase()),
                )
                .map(([q, a, href]) => (
                  <details className="profile-item" key={q}>
                    <summary className="cursor-pointer text-sm font-bold">
                      {tr(q)}
                    </summary>
                    <p className="workspace-muted my-3 text-sm leading-relaxed">
                      {tr(a)}
                    </p>
                    <a className="profile-link" href={href}>
                      {tr("Открыть раздел")}
                    </a>
                  </details>
                ))}
              {!faq.some(([q, a]) =>
                `${tr(q)} ${tr(a)} ${q} ${a}`
                  .toLocaleLowerCase()
                  .includes(search.trim().toLocaleLowerCase()),
              ) && (
                <Empty title={tr("Ответ не найден")}>
                  <button
                    className="profile-link"
                    onClick={() => setView("new")}
                  >
                    {tr("Написать в поддержку")}
                  </button>
                </Empty>
              )}
            </div>
          </>
        )}
        <div hidden={view !== "new"}>
          <TicketComposer
            data={data}
            draft={draft}
            onDone={() => {
              setView("tickets");
              onDone();
            }}
          />
        </div>
        {view === "tickets" &&
          (selectedTicket ? (
            <>
              <Button
                variant="ghost"
                className="mb-3"
                onClick={() => setSelected("")}
              >
                {tr("← Все обращения")}
              </Button>
              <TicketThread key={selectedTicket.id} ticket={selectedTicket} />
            </>
          ) : data.tickets.length ? (
            <div>
              {data.tickets.map((t) => (
                <button
                  className="profile-item flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                >
                  <div>
                    <strong className="text-sm">
                      №{t.number} · {tr(t.subject)}
                    </strong>
                    <p className="workspace-muted mt-1 text-xs">
                      {tr(dateLabel(t.updated_at, true, language))}
                    </p>
                  </div>
                  <span className="workspace-tag">
                    {tr(ticketStatuses[t.status])}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty title={tr("Обращений пока нет")}>
              {tr("Отправьте вопрос — переписка сохранится здесь.")}
            </Empty>
          ))}
      </Panel>
      <Panel title={tr("Документы платформы")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "Правила участия",
            "Отмена участия",
            "Порядок споров",
            "Конфиденциальность",
          ].map((title) => (
            <Link
              className="workspace-panel-raised p-4 text-sm font-bold"
              key={title}
              to="/legal"
            >
              {tr(title)} ↗
            </Link>
          ))}
        </div>
        <p className="workspace-muted mt-4 text-xs">
          {tr("Дата редакции указана на странице документов.")}
        </p>
      </Panel>
    </>
  );
}
export function SupportAdmin() {
  const { tr, language } = useI18n();
  const query = useQuery({
    queryKey: ["support-admin"],
    queryFn: () => getSupportAdmin(),
    refetchInterval: 30000,
  });
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState("");
  const ticket = query.data?.find((t) => t.id === selected);
  return (
    <Panel
      title={tr("Поддержка и модерация")}
      subtitle={tr("Обращения, жалобы на отзывы и исправления посещаемости")}
    >
      {query.isPending ? (
        <p role="status">{tr("Загружаем обращения…")}</p>
      ) : query.isError ? (
        <>
          <ErrorNotice message={tr(errorText(query.error))} />
          <Button onClick={() => void query.refetch()}>
            {tr("Повторить")}
          </Button>
        </>
      ) : ticket ? (
        <>
          <Button
            variant="ghost"
            className="mb-3"
            onClick={() => setSelected("")}
          >
            {tr("← К списку")}
          </Button>
          <TicketThread key={ticket.id} ticket={ticket} staff />
        </>
      ) : (
        <>
          <select
            aria-label={tr("Фильтр обращений")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">{tr("Открытые")}</option>
            <option value="all">{tr("Все")}</option>
            <option value="resolved">{tr("Решённые")}</option>
          </select>
          {query.data
            ?.filter(
              (t) =>
                status === "all" ||
                (status === "open"
                  ? t.status !== "resolved"
                  : t.status === "resolved"),
            )
            .map((t) => (
              <button
                className="profile-item flex w-full flex-wrap justify-between gap-3 text-left"
                key={t.id}
                onClick={() => setSelected(t.id)}
              >
                <span>
                  №{t.number} · {tr(t.subject)}
                  <small className="workspace-muted mt-1 block">
                    {tr(t.name)} · {tr(ticketTopics[t.topic])}
                  </small>
                </span>
                <span className="workspace-tag">
                  {tr(ticketStatuses[t.status])}
                </span>
              </button>
            ))}
          {!query.data?.length && <Empty title={tr("Обращений пока нет")} />}
        </>
      )}
    </Panel>
  );
}
function AttachmentLink({ path, index }: { path: string; index: number }) {
  const { tr, language } = useI18n();
  const query = useQuery({
    queryKey: ["support-attachment", path],
    queryFn: () => signedFileUrl("support", path, 3600),
    staleTime: 50 * 60 * 1000,
  });
  return query.data ? (
    <a
      className="profile-link mt-2 mr-4 inline-block"
      href={query.data}
      target="_blank"
      rel="noopener noreferrer"
    >
      {tr("Вложение ")}
      {index + 1} ↗
    </a>
  ) : (
    <button
      className="profile-link mt-2 mr-4"
      disabled={query.isPending}
      onClick={() => void query.refetch()}
    >
      {tr(
        query.isPending
          ? "Готовим вложение…"
          : "Не удалось открыть · повторить",
      )}
    </button>
  );
}
