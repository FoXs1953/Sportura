import {
  DISCIPLINES,
  MVP_TIERS,
  DISCIPLINE_FIELDS,
  disciplineDefaults,
} from "@/lib/disciplines";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProfileForm } from "@/components/profile/shared";
import { mutateEvent } from "@/lib/event.functions";
import {
  eventDraft,
  localDateTime,
  isoDateTime,
  type Event,
  type HostDocument,
  type EventDraft,
} from "@/lib/event-model";
import {
  SPORTS,
  CITIES,
  SKILL_LEVELS,
  ACTIVITY_TYPE_LABEL,
  sportImage,
  formatKzt,
} from "@/lib/sportura";
import { Panel, ErrorNotice, Confirm, useEventAction } from "../shared";
const steps = [
  "Формат",
  "Сведения",
  "Место и время",
  "Состав",
  "Доступ",
  "Предпросмотр",
];
export function EventWizard({
  document,
  event,
  documents,
  competition,
  onDone,
  onClose,
}: {
  document?: HostDocument | undefined;
  event?: Event | undefined;
  documents: HostDocument[];
  competition: boolean;
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof EventDraft, string>>
  >({});
  const action = useEventAction();
  const saved = useRef<{ id: string; version?: string }>({
    id: document?.id ?? crypto.randomUUID(),
    ...(document?.updated_at ? { version: document.updated_at } : {}),
  });
  const initial = useRef<EventDraft>(
    document?.data ??
      (event
        ? eventDraft(event)
        : {
            ...eventDraft(),
            ...documents.find((d) => d.kind === "defaults")?.data,
            kaspi_payment_link: "",
          }),
  );
  const form = useProfileForm("event-draft", initial.current, async (value) => {
    const d = await mutateEvent({
      data: {
        action: "document",
        payload: {
          id: saved.current.id,
          kind: "draft",
          name: value.title || "Новое событие",
          data: {
            ...value,
            entry_fee: 0,
            kaspi_payment_link: "",
            prize_pool: { "1": 100 },
            tier: value.type === "daily_game" ? null : "spark",
          },
          ...(event
            ? { activity_id: event.id }
            : document?.activity_id
              ? { activity_id: document.activity_id }
              : {}),
          ...(saved.current.version ? { version: saved.current.version } : {}),
        },
      },
    });
    saved.current = { id: d.id, version: d.updated_at };
  });
  const v = form.value;
  const update = (p: Partial<EventDraft>) => {
    form.patch(p);
    setErrors({});
  };
  const field = (key: keyof EventDraft, label: string, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={String(v[key] ?? "")}
        onChange={(e) =>
          update({
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
        aria-invalid={!!errors[key]}
      />
      {errors[key] && <span className="event-error-field">{errors[key]}</span>}
    </label>
  );
  function validate() {
    const e: Partial<Record<keyof EventDraft, string>> = {};
    if (v.title.trim().length < 3) e.title = "Минимум 3 символа";
    if (v.location_text.trim().length < 3) e.location_text = "Укажите площадку";
    if (!v.date_time || Date.parse(v.date_time) <= Date.now())
      e.date_time = "Выберите будущее время";
    if (v.max_participants < 2 || v.max_participants > 200)
      e.max_participants = "От 2 до 200 мест";
    if (v.duration_minutes < 15 || v.duration_minutes > 10080)
      e.duration_minutes = "От 15 минут до 7 дней";
    if (
      v.registration_deadline &&
      Date.parse(v.registration_deadline) > Date.parse(v.date_time)
    )
      e.registration_deadline = "Не позже начала события";
    if (
      v.two_gis_url &&
      !/^https:\/\/(2gis\.kz|go\.2gis\.com)\//.test(v.two_gis_url)
    )
      e.two_gis_url = "Нужна ссылка 2GIS";
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  return (
    <Panel
      title={
        event || document?.activity_id
          ? "Редактирование события"
          : "Новое событие"
      }
      description="Черновик хранится в аккаунте. Время — Астана / Алматы (UTC+5)."
    >
      <fieldset disabled={form.busy || action.busy} className="event-form">
        <nav className="event-wizard-steps" aria-label="Этапы создания">
          {steps.map((s, i) => (
            <button
              key={s}
              className={step === i ? "is-active" : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={async () => {
                if (await form.submit()) setStep(i);
              }}
              disabled={form.busy}
            >
              {i + 1}. {s}
            </button>
          ))}
        </nav>
        {step === 0 && (
          <>
            <label>
              Формат
              <select
                value={v.type}
                disabled={!!event || !!document?.activity_id}
                onChange={(e) =>
                  update({ type: e.target.value as EventDraft["type"] })
                }
              >
                {Object.entries(ACTIVITY_TYPE_LABEL)
                  .filter(([t]) => t === "daily_game" || competition)
                  .map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
              </select>
            </label>
            {v.type !== "daily_game" && (
              <div className="event-form-grid">
                <label>
                  Серия турнира
                  <select
                    value={v.tier ?? "spark"}
                    onChange={(e) =>
                      update({
                        tier: "spark",
                        ...(e.target.value === "spark" ? { entry_fee: 0 } : {}),
                      })
                    }
                  >
                    {Object.entries(MVP_TIERS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Сетка
                  <select
                    value={
                      v.type === "league"
                        ? "round_robin"
                        : (v.competition_format ?? "single_elimination")
                    }
                    disabled={v.type === "league"}
                    onChange={(e) =>
                      update({
                        competition_format: e.target.value as
                          "single_elimination" | "round_robin",
                      })
                    }
                  >
                    <option value="single_elimination">На выбывание</option>
                    <option value="round_robin">Каждый с каждым</option>
                  </select>
                </label>
              </div>
            )}
            <label>
              Использовать шаблон
              <select
                defaultValue=""
                onChange={(e) => {
                  const d = documents.find((d) => d.id === e.target.value);
                  if (d)
                    update({
                      ...d.data,
                      date_time: "",
                      registration_deadline: "",
                    });
                }}
              >
                <option value="">Без шаблона</option>
                {documents
                  .filter(
                    (d) =>
                      d.kind === "template" &&
                      (competition || d.data.type === "daily_game"),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {step === 1 && (
          <>
            <div className="event-form-grid">
              {field("title", "Название")}
              <label>
                Вид спорта
                <select
                  value={v.sport}
                  onChange={(e) => {
                    const d = DISCIPLINES.find(
                      (d) => d.name === e.target.value,
                    );
                    update({
                      sport: e.target.value,
                      match_settings: disciplineDefaults(e.target.value),
                      team_min: d?.min ?? 1,
                      team_max: d?.max ?? 50,
                      ...(!v.rules ? { rules: d?.rules ?? "" } : {}),
                    });
                  }}
                >
                  {SPORTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Уровень
                <select
                  value={v.skill_level}
                  onChange={(e) => update({ skill_level: e.target.value })}
                >
                  {SKILL_LEVELS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {field(
                "cover_url",
                "Своя обложка — HTTPS-ссылка (необязательно)",
                "url",
              )}
            </div>
            <fieldset className="event-form-grid">
              <legend className="mb-3 font-semibold">
                Настройки дисциплины
              </legend>
              {(
                DISCIPLINE_FIELDS[
                  DISCIPLINES.find((d) => d.name === v.sport)?.id ?? ""
                ] ?? []
              ).map((f) => (
                <label key={f.key}>
                  {f.label}
                  {f.type === "select" ? (
                    <select
                      value={v.match_settings?.[f.key] ?? f.default}
                      onChange={(e) =>
                        update({
                          match_settings: {
                            ...v.match_settings,
                            [f.key]: e.target.value,
                          },
                        })
                      }
                    >
                      {f.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      min={f.min}
                      max={f.max}
                      maxLength={300}
                      value={v.match_settings?.[f.key] ?? f.default}
                      onChange={(e) =>
                        update({
                          match_settings: {
                            ...v.match_settings,
                            [f.key]: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </fieldset>
            <img
              src={v.cover_url || sportImage(v.sport)}
              alt="Предпросмотр обложки"
              className="h-40 w-full rounded-xl object-cover"
              onError={(e) => {
                e.currentTarget.src = sportImage(v.sport);
              }}
            />
            <label>
              Описание
              <textarea
                rows={4}
                maxLength={3000}
                value={v.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <label>
              Сохранённая площадка
              <select
                defaultValue=""
                onChange={(e) => {
                  const d = documents.find((d) => d.id === e.target.value);
                  if (d) {
                    const {
                      city,
                      district,
                      location_text,
                      two_gis_url,
                      venue_type,
                    } = d.data;
                    update({
                      city,
                      district,
                      location_text,
                      two_gis_url,
                      venue_type,
                    });
                  }
                }}
              >
                <option value="">Ввести новую</option>
                {documents
                  .filter((d) => d.kind === "venue")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="event-form-grid">
              <label>
                Город
                <select
                  value={v.city}
                  onChange={(e) => update({ city: e.target.value })}
                >
                  {CITIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {field("district", "Район")}
              {field("location_text", "Площадка и адрес")}
              {field("two_gis_url", "Ссылка 2GIS", "url")}
              <label>
                Тип площадки
                <select
                  value={v.venue_type}
                  onChange={(e) => update({ venue_type: e.target.value })}
                >
                  <option value="unknown">Не указан</option>
                  <option value="indoor">В помещении</option>
                  <option value="outdoor">На улице</option>
                </select>
              </label>
              <label>
                Начало
                <input
                  type="datetime-local"
                  value={localDateTime(v.date_time)}
                  onChange={(e) =>
                    update({ date_time: isoDateTime(e.target.value) })
                  }
                />
                {errors.date_time && (
                  <span className="event-error-field">{errors.date_time}</span>
                )}
              </label>
              {field("duration_minutes", "Продолжительность, минут", "number")}
              <label>
                Окончание регистрации
                <input
                  type="datetime-local"
                  value={localDateTime(v.registration_deadline)}
                  onChange={(e) =>
                    update({
                      registration_deadline: isoDateTime(e.target.value),
                    })
                  }
                />
                {errors.registration_deadline && (
                  <span className="event-error-field">
                    {errors.registration_deadline}
                  </span>
                )}
              </label>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <label>
              Запись
              <select
                value={v.participation_mode}
                onChange={(e) =>
                  update({
                    participation_mode: e.target.value as "team" | "individual",
                    ...(e.target.value === "team" && !event
                      ? {
                          team_min:
                            DISCIPLINES.find((d) => d.name === v.sport)?.min ??
                            1,
                          team_max:
                            DISCIPLINES.find((d) => d.name === v.sport)?.max ??
                            50,
                        }
                      : {}),
                  })
                }
              >
                <option value="individual">Индивидуальная</option>
                <option value="team">Командная — записывает капитан</option>
              </select>
            </label>
            {field(
              "max_participants",
              v.participation_mode === "team"
                ? "Количество команд"
                : "Количество участников",
              "number",
            )}
            {v.type !== "daily_game" &&
              field(
                "min_participants",
                "Минимум участников для старта",
                "number",
              )}
            {v.type !== "daily_game" && (
              <p className="workspace-muted">
                Если к дедлайну регистрации минимум не набран, турнир отменится
                автоматически. Без отдельного дедлайна проверка выполняется при
                наступлении времени старта. Для командной записи считаются
                команды.
              </p>
            )}
            {v.participation_mode === "team" && (
              <div className="event-form-grid">
                {field("team_min", "Минимум игроков в команде", "number")}
                {field("team_max", "Максимум с запасными", "number")}
              </div>
            )}
            <button
              type="button"
              className="feed-chip"
              onClick={() =>
                update({
                  rules:
                    DISCIPLINES.find((d) => d.name === v.sport)?.rules ?? "",
                })
              }
            >
              Вставить регламент дисциплины
            </button>
            <label>
              Правила и ограничения
              <textarea
                rows={4}
                maxLength={4000}
                value={v.rules}
                onChange={(e) => update({ rules: e.target.value })}
              />
            </label>
            {v.type !== "daily_game" && (
              <p className="workspace-muted">
                {v.type === "league" || v.competition_format === "round_robin"
                  ? "Каждый играет с каждым один раз. Победа — 3 очка, ничья — 1. При равенстве: разница мячей, затем забитые."
                  : "Турнир на выбывание. Пары формируются по порядку записи, нечётный участник проходит раунд без матча."}{" "}
                До 32 команд или игроков в сетке. Дополнительное правило для
                ничьей укажите в регламенте.
              </p>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <label className="event-check">
              <input
                type="checkbox"
                disabled={!!event || !!document?.activity_id}
                checked={v.is_private}
                onChange={(e) => update({ is_private: e.target.checked })}
              />
              Закрытое событие — доступ по коду
            </label>
            <p className="workspace-muted">
              {v.is_private
                ? "Код и ссылка появятся после публикации. Событие скрыто из ленты."
                : "Событие появится в общей ленте."}
            </p>
            <label>
              Что взять с собой
              <textarea
                rows={3}
                maxLength={1000}
                value={v.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>
          </>
        )}
        {step === 5 && (
          <div className="event-muted-box space-y-3">
            <h3 className="event-title">
              {v.title || "Название не заполнено"}
            </h3>
            <p>
              {ACTIVITY_TYPE_LABEL[v.type]} · {v.sport} · {v.skill_level}
            </p>
            <p>
              {v.city}, {v.location_text}
            </p>
            <p>
              {v.date_time
                ? new Date(v.date_time).toLocaleString("ru-RU", {
                    timeZone: "Asia/Almaty",
                  })
                : "Выберите время"}{" "}
              · {v.duration_minutes} мин.
            </p>
            <p>
              {v.max_participants}{" "}
              {v.participation_mode === "team" ? "команд" : "участников"} ·{" "}
              {v.entry_fee ? formatKzt(v.entry_fee) : "Бесплатно"} ·{" "}
              {v.is_private ? "По приглашению" : "Открытая запись"}
            </p>
            <p className="event-description">{v.description}</p>
            <p className="event-description">{v.rules}</p>
            <p className="event-description">{v.cancellation_policy}</p>
            {Object.entries(errors).map(([k, e]) => (
              <p className="event-error-field" key={k}>
                {e}
              </p>
            ))}
          </div>
        )}
        <ErrorNotice message={form.error || action.error} />
        <p className="event-count-note">
          {form.dirty
            ? "Есть несохранённые изменения"
            : saved.current.version
              ? "Черновик сохранён в аккаунте"
              : "Заполните форму и сохраните черновик"}
        </p>
        <div className="event-actions">
          <Button
            variant="outline"
            disabled={form.busy || action.busy}
            onClick={() => void form.submit()}
          >
            Сохранить черновик
          </Button>
          {step < 5 ? (
            <Button
              disabled={form.busy}
              onClick={async () => {
                if (await form.submit()) setStep(step + 1);
              }}
            >
              Далее
            </Button>
          ) : (
            <Button
              disabled={form.busy || action.busy}
              onClick={() => {
                if (validate()) setConfirm(true);
              }}
            >
              Опубликовать
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              if (!form.dirty || (await form.submit())) onClose();
            }}
          >
            Закрыть
          </Button>
        </div>
        <Confirm
          open={confirm}
          title={
            event ? "Сохранить изменения события?" : "Опубликовать событие?"
          }
          description="Проверьте время, стоимость и правила. Записавшиеся участники получат уведомление об изменениях."
          busy={action.busy || form.busy}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            if (!(await form.submit())) return;
            await action.run(async () => {
              const result = await mutateEvent({
                data: {
                  action: "publish",
                  payload: {
                    id: saved.current.id,
                    version: saved.current.version,
                  },
                },
              });
              setConfirm(false);
              onDone(result.id);
            }, "Событие опубликовано");
          }}
        />
      </fieldset>
    </Panel>
  );
}
