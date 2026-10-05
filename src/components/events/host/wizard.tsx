import { useI18n, formatDate } from "@/lib/i18n";
import { EVENT_SERIES, type EventExtras } from "@/lib/event-series";
import {
  COMPETITION_FORMATS,
  type CompetitionFormat,
} from "@/lib/competition-formats";
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
const fieldSteps: Partial<Record<keyof EventDraft, number>> = {
  title: 1,
  location_text: 2,
  date_time: 2,
  duration_minutes: 2,
  registration_deadline: 2,
  two_gis_url: 2,
  max_participants: 3,
  entry_fee: 3,
};
export function EventWizard({
  document,
  event,
  documents,
  qualifiers = [],
  competition,
  onDone,
  onClose,
}: {
  document?: HostDocument | undefined;
  event?: Event | undefined;
  documents: HostDocument[];
  qualifiers?: Event[];
  competition: boolean;
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const { tr, language } = useI18n();
  const [step, setStep] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof EventDraft, string>>
  >({});
  const action = useEventAction();
  const saved = useRef<{
    id: string;
    version?: string;
  }>({
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
          name: value.title || tr("Новое событие"),
          data: {
            ...value,
            entry_fee: value.type === "daily_game" ? 0 : value.entry_fee,
            kaspi_payment_link: "",
            prize_pool: { "1": 100 },
            tier: value.type === "daily_game" ? null : value.tier,
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
  const templates = documents.filter(
    (d) =>
      d.kind === "template" && (competition || d.data.type === "daily_game"),
  );
  const update = (p: Partial<EventDraft>) => {
    form.patch(p);
    setErrors({});
  };
  const field = (key: keyof EventDraft, label: string, type = "text") => (
    <label>
      {tr(label)}
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
      {tr(
        errors[key] && (
          <span className="event-error-field">{tr(errors[key])}</span>
        ),
      )}
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
    if (
      v.duration_minutes < 15 ||
      v.duration_minutes > (v.type === "league" ? 100800 : 10080)
    )
      e.duration_minutes =
        v.type === "league"
          ? "От 15 минут до 10 недель"
          : "От 15 минут до 7 дней";
    if (v.type === "tournament") {
      if (v.tier === "spark" && v.entry_fee !== 0)
        e.entry_fee = "Бесплатная серия Spark не имеет взноса";
      if (
        v.tier === "blitz" &&
        (v.entry_fee <= 0 || v.entry_fee > 100000 || v.duration_minutes > 1440)
      )
        e.entry_fee = "Blitz: взнос больше 0 ₸ и длительность до одного дня";
      if (
        v.tier === "marathon" &&
        (v.entry_fee <= 0 || v.entry_fee > 100000 || v.duration_minutes <= 1440)
      )
        e.entry_fee =
          "Marathon: взнос больше 0 ₸ и длительность больше одного дня";
    }
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
  async function goToStep(nextStep: number) {
    if (nextStep === step) return;
    if ((!form.dirty && saved.current.version) || (await form.submit())) {
      if (nextStep === 5) validate();
      setStep(nextStep);
    }
  }
  return (
    <Panel
      title={tr(
        event || document?.activity_id
          ? "Редактирование события"
          : "Новое событие",
      )}
      description={tr(
        "Изменения сохраняются при переходе между этапами и кнопкой «Сохранить черновик». Время — Астана / Алматы (UTC+5).",
      )}
    >
      <fieldset disabled={form.busy || action.busy} className="event-form">
        <nav className="event-wizard-steps" aria-label={tr("Этапы создания")}>
          {steps.map((s, i) => (
            <button
              key={s}
              className={step === i ? "is-active" : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={() => void goToStep(i)}
              disabled={form.busy}
            >
              {i + 1}. {tr(s)}
            </button>
          ))}
        </nav>
        {step === 0 && (
          <>
            {competition || v.type !== "daily_game" ? (
              <label>
                {tr("Формат")}
                <select
                  value={v.type}
                  disabled={!!event || !!document?.activity_id}
                  onChange={(e) => {
                    const nextType = e.target.value as EventDraft["type"];
                    update({
                      type: nextType,
                      competition_format:
                        nextType === "league"
                          ? "league_playoff"
                          : "single_elimination",
                      duration_minutes: nextType === "league" ? 40320 : 180,
                      ...(nextType === "tournament"
                        ? {}
                        : {
                            tier: nextType === "league" ? "spark" : null,
                            entry_fee: 0,
                          }),
                    });
                  }}
                >
                  {Object.entries(ACTIVITY_TYPE_LABEL)
                    .filter(([t]) => t === "daily_game" || competition)
                    .map(([k, l]) => (
                      <option key={k} value={k}>
                        {tr(l)}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div className="event-muted-box">
                <h3 className="font-semibold">{tr("Игра")}</h3>
                <p className="workspace-muted mt-2 text-sm">
                  {tr(
                    "Вы создаёте игру без турнирной сетки. После публикации игроки смогут записаться.",
                  )}
                </p>
              </div>
            )}
            {v.type !== "daily_game" && (
              <div className="event-form-grid">
                <label>
                  {tr("Тип участия")}
                  <select
                    value={v.tier ?? "spark"}
                    onChange={(e) =>
                      update({
                        tier: e.target.value as "spark" | "blitz" | "marathon",
                        ...(e.target.value === "spark"
                          ? { entry_fee: 0 }
                          : { entry_fee: Math.max(v.entry_fee, 1000) }),
                        ...(e.target.value === "marathon" &&
                        v.duration_minutes <= 1440
                          ? { duration_minutes: 2880 }
                          : e.target.value === "blitz" &&
                              v.duration_minutes > 1440
                            ? { duration_minutes: 240 }
                            : {}),
                      })
                    }
                  >
                    {Object.entries(MVP_TIERS)
                      .filter(([key]) =>
                        v.type === "league" ? key === "spark" : true,
                      )
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {tr(label)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {tr("Сетка")}
                  <select
                    value={
                      v.competition_format ??
                      (v.type === "league"
                        ? "round_robin"
                        : "single_elimination")
                    }
                    onChange={(e) =>
                      update({
                        competition_format: e.target.value as CompetitionFormat,
                      })
                    }
                  >
                    {Object.entries(COMPETITION_FORMATS).map(
                      ([key, format]) => (
                        <option key={key} value={key}>
                          {tr(format.label)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            )}
            {v.competition_format === "league_playoff" && (
              <label>
                {tr("Кругов лиги")}
                <select
                  value={v.match_settings?.["league_legs"] ?? "1"}
                  onChange={(e) =>
                    update({
                      match_settings: {
                        ...v.match_settings,
                        league_legs: e.target.value,
                      },
                    })
                  }
                >
                  <option value="1">
                    {tr("Один — одна встреча с каждым")}
                  </option>
                  <option value="2">{tr("Два — дома и в гостях")}</option>
                </select>
              </label>
            )}
            {v.type !== "daily_game" && (
              <div className="event-form-grid">
                <label>
                  {tr("Серия")}
                  <select
                    value={v.event_extras?.series ?? "open"}
                    onChange={(e) =>
                      update({
                        event_extras: {
                          ...v.event_extras,
                          series: e.target.value as NonNullable<
                            EventExtras["series"]
                          >,
                        },
                      })
                    }
                  >
                    {Object.entries(EVENT_SERIES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {tr(label)}
                      </option>
                    ))}
                  </select>
                </label>
                {v.event_extras?.series === "rookie_cup" && (
                  <label>
                    {tr("Максимальный рейтинг")}
                    <select
                      value={v.event_extras.rating_limit ?? 1100}
                      onChange={(e) =>
                        update({
                          event_extras: {
                            ...v.event_extras,
                            rating_limit: Number(e.target.value),
                          },
                        })
                      }
                    >
                      {[1000, 1100, 1200, 1300, 1400].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {tr("Отбор на участие")}
                  <select
                    value={v.event_extras?.qualifier_id ?? ""}
                    onChange={(e) =>
                      update({
                        event_extras: {
                          ...v.event_extras,
                          qualifier_id: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">{tr("Открытая регистрация")}</option>
                    {qualifiers
                      .filter(
                        (a) =>
                          a.status === "completed" &&
                          !a.is_private &&
                          a.sport === v.sport &&
                          a.dispute_window_ends_at &&
                          Date.parse(a.dispute_window_ends_at) <= Date.now(),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {tr("Призёры 1–4: ")}
                          {tr(a.title)}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="workspace-muted text-xs wide">
                  {tr(
                    "Название серии не меняет дату и стоимость. Для платных форматов доступны только черновики.",
                  )}
                </p>
              </div>
            )}
            {templates.length > 0 && (
              <label>
                {tr("Использовать шаблон")}
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
                  <option value="">{tr("Без шаблона")}</option>
                  {templates.map((d) => (
                    <option key={d.id} value={d.id}>
                      {tr(d.name)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <div className="event-form-grid">
              {field("title", "Название")}
              <label>
                {tr("Вид спорта")}
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
                    <option key={s} value={s}>
                      {tr(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Уровень")}
                <select
                  value={v.skill_level}
                  onChange={(e) => update({ skill_level: e.target.value })}
                >
                  {SKILL_LEVELS.map((s) => (
                    <option key={s} value={s}>
                      {tr(s)}
                    </option>
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
                {tr("Настройки дисциплины")}
              </legend>
              {(
                DISCIPLINE_FIELDS[
                  DISCIPLINES.find((d) => d.name === v.sport)?.id ?? ""
                ] ?? []
              ).map((f) => (
                <label key={f.key}>
                  {tr(f.label)}
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
                        <option key={o} value={o}>
                          {tr(o)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      min={f.min}
                      max={f.max}
                      maxLength={300}
                      value={tr(v.match_settings?.[f.key] ?? f.default)}
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
              alt={tr("Предпросмотр обложки")}
              className="h-40 w-full rounded-xl object-cover"
              onError={(e) => {
                e.currentTarget.src = sportImage(v.sport);
              }}
            />
            <label>
              {tr("Описание")}
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
              {tr("Сохранённая площадка")}
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
                <option value="">{tr("Ввести новую")}</option>
                {documents
                  .filter((d) => d.kind === "venue")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {tr(d.name)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="event-form-grid">
              <label>
                {tr("Город")}
                <select
                  value={v.city}
                  onChange={(e) => update({ city: e.target.value })}
                >
                  {CITIES.map((s) => (
                    <option key={s} value={s}>
                      {tr(s)}
                    </option>
                  ))}
                </select>
              </label>
              {field("district", "Район")}
              {field("location_text", "Площадка и адрес")}
              {field("two_gis_url", "Ссылка 2GIS", "url")}
              <label>
                {tr("Тип площадки")}
                <select
                  value={v.venue_type}
                  onChange={(e) => update({ venue_type: e.target.value })}
                >
                  <option value="unknown">{tr("Не указан")}</option>
                  <option value="indoor">{tr("В помещении")}</option>
                  <option value="outdoor">{tr("На улице")}</option>
                </select>
              </label>
              <label>
                {tr("Начало")}
                <input
                  type="datetime-local"
                  aria-invalid={!!errors.date_time}
                  value={localDateTime(v.date_time)}
                  onChange={(e) =>
                    update({ date_time: isoDateTime(e.target.value) })
                  }
                />
                {tr(
                  errors.date_time && (
                    <span className="event-error-field">
                      {tr(errors.date_time)}
                    </span>
                  ),
                )}
              </label>
              {v.type === "league" ? (
                <label>
                  {tr("Длительность сезона")}
                  <select
                    aria-invalid={!!errors.duration_minutes}
                    value={v.duration_minutes}
                    onChange={(e) =>
                      update({ duration_minutes: Number(e.target.value) })
                    }
                  >
                    {![40320, 60480, 80640, 100800].includes(
                      v.duration_minutes,
                    ) && (
                      <option value={v.duration_minutes}>
                        {v.duration_minutes}
                        {tr(" минут (текущее значение)")}
                      </option>
                    )}
                    {[4, 6, 8, 10].map((weeks) => (
                      <option key={weeks} value={weeks * 10080}>
                        {weeks}
                        {tr(" недель")}
                      </option>
                    ))}
                  </select>
                  {errors.duration_minutes && (
                    <span className="event-error-field">
                      {tr(errors.duration_minutes)}
                    </span>
                  )}
                </label>
              ) : (
                field("duration_minutes", "Продолжительность, минут", "number")
              )}
              <label>
                {tr("Окончание регистрации")}
                <input
                  type="datetime-local"
                  aria-invalid={!!errors.registration_deadline}
                  value={localDateTime(v.registration_deadline)}
                  onChange={(e) =>
                    update({
                      registration_deadline: isoDateTime(e.target.value),
                    })
                  }
                />
                {tr(
                  errors.registration_deadline && (
                    <span className="event-error-field">
                      {tr(errors.registration_deadline)}
                    </span>
                  ),
                )}
              </label>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <label>
              {tr("Запись")}
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
                <option value="individual">{tr("Индивидуальная")}</option>
                <option value="team">
                  {tr("Командная — записывает капитан")}
                </option>
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
            {v.type === "tournament" && v.tier !== "spark" && (
              <>
                {field(
                  "entry_fee",
                  "Взнос за участника или команду, ₸",
                  "number",
                )}
                <p className="workspace-muted">
                  {tr(
                    "Платный турнир можно подготовить и сохранить как черновик. Публикация и запись откроются после подключения платёжного провайдера Sportura.",
                  )}
                </p>
              </>
            )}
            {v.type !== "daily_game" && (
              <p className="workspace-muted">
                {tr(
                  "Если к дедлайну регистрации минимум не набран, турнир отменится автоматически. Без отдельного дедлайна проверка выполняется при наступлении времени старта. Для командной записи считаются команды.",
                )}
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
              {tr("Вставить регламент дисциплины")}
            </button>
            <label>
              {tr("Правила и ограничения")}
              <textarea
                rows={4}
                maxLength={4000}
                value={tr(v.rules)}
                onChange={(e) => update({ rules: e.target.value })}
              />
            </label>
            {v.type !== "daily_game" && (
              <p className="workspace-muted">
                {tr(
                  COMPETITION_FORMATS[
                    v.competition_format ?? "single_elimination"
                  ].description,
                )}
                {tr(" ")}
                {tr(
                  "До 128 команд или игроков. Дополнительные правила укажите в регламенте.",
                )}
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
              {tr("Закрытое событие — доступ по коду")}
            </label>
            <p className="workspace-muted">
              {tr(
                v.is_private
                  ? "Код и ссылка появятся после публикации. Событие скрыто из ленты."
                  : "Событие появится в общей ленте.",
              )}
            </p>
            <label>
              {tr("Что взять с собой")}
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
              {tr(v.title || "Название не заполнено")}
            </h3>
            <p>
              {tr(ACTIVITY_TYPE_LABEL[v.type])} · {tr(v.sport)} ·{" "}
              {tr(v.skill_level)}
            </p>
            <p>
              {tr(v.city)}, {tr(v.location_text)}
            </p>
            <p>
              {tr(
                v.date_time
                  ? formatDate(
                      v.date_time,
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                      language,
                    )
                  : "Выберите время",
              )}
              {tr(" ")}· {v.duration_minutes}
              {tr(" мин.")}
            </p>
            <p>
              {v.max_participants}
              {tr(" ")}
              {tr(v.participation_mode === "team" ? "команд" : "участников")} ·
              {tr(" ")}
              {tr(v.entry_fee ? formatKzt(v.entry_fee) : "Бесплатно")} ·
              {tr(" ")}
              {tr(v.is_private ? "По приглашению" : "Открытая запись")}
            </p>
            <p className="event-description">{tr(v.description)}</p>
            <p className="event-description">{tr(v.rules)}</p>
            <p className="event-description">{tr(v.cancellation_policy)}</p>
            {Object.keys(errors).length > 0 && (
              <div role="alert" className="space-y-2">
                <p className="event-error-field">
                  {tr("Перед публикацией исправьте поля:")}
                </p>
                {Object.entries(errors).map(([key, error]) => {
                  const target = fieldSteps[key as keyof EventDraft] ?? 1;
                  return (
                    <button
                      type="button"
                      className="event-error-field block text-left underline underline-offset-4"
                      key={key}
                      onClick={() => void goToStep(target)}
                    >
                      {tr(steps[target])}: {tr(error)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <ErrorNotice message={tr(form.error || action.error)} />
        <p className="event-count-note">
          {tr(
            form.dirty
              ? "Есть несохранённые изменения"
              : saved.current.version
                ? "Черновик сохранён в аккаунте"
                : "Заполните форму и сохраните черновик",
          )}
        </p>
        <div className="event-actions">
          <Button
            variant="outline"
            disabled={form.busy || action.busy}
            onClick={() => void form.submit()}
          >
            {tr("Сохранить черновик")}
          </Button>
          {step < 5 ? (
            <Button
              disabled={form.busy}
              onClick={() => void goToStep(step + 1)}
            >
              {tr("Далее")}
            </Button>
          ) : (
            <Button
              disabled={form.busy || action.busy || v.entry_fee > 0}
              onClick={() => {
                if (validate()) setConfirm(true);
              }}
            >
              {tr("Опубликовать")}
            </Button>
          )}
          {step === 5 && v.entry_fee > 0 && (
            <p className="workspace-muted">
              {tr(
                "Платный турнир сохраните как черновик. Публикация станет доступна после подключения платёжного провайдера Sportura.",
              )}
            </p>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              if (!form.dirty || (await form.submit())) onClose();
            }}
          >
            {tr("Закрыть")}
          </Button>
        </div>
        <Confirm
          open={confirm}
          title={tr(
            event ? "Сохранить изменения события?" : "Опубликовать событие?",
          )}
          description={tr(
            "Проверьте время, стоимость и правила. Записавшиеся участники получат уведомление об изменениях.",
          )}
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
        >
          <ErrorNotice message={tr(form.error || action.error)} />
        </Confirm>
      </fieldset>
    </Panel>
  );
}
