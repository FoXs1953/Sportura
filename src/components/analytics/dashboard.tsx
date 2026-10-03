import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/lib/analytics.functions";
import { escapeCsv } from "@/lib/event-model";
const labels: Record<string, string> = {
  direct: "Прямой",
  instagram: "Instagram",
  telegram: "Telegram",
  search: "Поиск",
  other: "Другой",
  visitors: "Посетили сайт",
  activity_views: "Открыли событие",
  register_clicks: "Нажали «Записаться»",
  accounts: "Создали аккаунт",
  registrations: "Записались на событие",
};
const percent = (a: number, b: number) =>
  b ? `${Math.round((a / b) * 100)}%` : "—";
const day = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function AnalyticsDashboard() {
  const { tr } = useI18n();
  const [period, setPeriod] = useState(7);
  const [dates, setDates] = useState(() => ({
    from: day(new Date(Date.now() - 6 * 86400000)),
    to: day(new Date()),
  }));
  const [range, setRange] = useState(dates);
  const from = new Date(range.from + "T00:00:00+05:00").toISOString();
  const to = new Date(
    new Date(range.to + "T00:00:00+05:00").getTime() + 86400000,
  ).toISOString();
  const q = useQuery({
    queryKey: ["admin", "analytics", from, to],
    queryFn: () => getAnalytics({ data: { from, to } }),
  });
  function preset(n: number) {
    setPeriod(n);
    if (n) {
      const d = {
        from: day(new Date(Date.now() - (n - 1) * 86400000)),
        to: day(new Date()),
      };
      setDates(d);
      setRange(d);
    }
  }
  const a = q.data;
  function download() {
    if (!a) return;
    const rows = [
      [tr("Показатель"), tr("Значение")],
      ...[
        "visitors",
        "activity_views",
        "register_clicks",
        "accounts",
        "registrations",
      ]
        .map((k) => [k, a.funnel[k]] as const)
        .map(([k, v]) => [tr(labels[k]), v]),
      ["DAU", a.active.dau],
      ["WAU", a.active.wau],
      ["MAU", a.active.mau],
      [tr("Дата"), tr("Новые аккаунты"), tr("Визиты")],
      ...a.daily.map((d) => [d.day, d.accounts, d.visits]),
    ];
    const blob = new Blob(
      [
        "\ufeff" +
          rows
            .map((r) => r.map((v) => escapeCsv(String(v))).join(","))
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `sportura-analytics-${range.from}-${range.to}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="space-y-6" aria-label={tr("Аналитика")}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          {tr("Период")}
          <select
            className="workspace-input block"
            value={period}
            onChange={(e) => preset(Number(e.target.value))}
          >
            <option value={1}>{tr("Сегодня")}</option>
            <option value={7}>{tr("7 дней")}</option>
            <option value={30}>{tr("30 дней")}</option>
            <option value={0}>{tr("Свои даты")}</option>
          </select>
        </label>
        {period === 0 && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (dates.from <= dates.to) setRange(dates);
            }}
          >
            <label>
              {tr("С")}
              <input
                aria-label={tr("Начало периода")}
                className="workspace-input block"
                type="date"
                required
                value={dates.from}
                max={dates.to}
                onChange={(e) => setDates({ ...dates, from: e.target.value })}
              />
            </label>
            <label>
              {tr("По")}
              <input
                aria-label={tr("Конец периода")}
                className="workspace-input block"
                type="date"
                required
                value={dates.to}
                min={dates.from}
                max={day(new Date())}
                onChange={(e) => setDates({ ...dates, to: e.target.value })}
              />
            </label>
            <button className="feed-chip">{tr("Применить")}</button>
          </form>
        )}
        <button disabled={!a} className="feed-chip" onClick={download}>
          {tr("Скачать CSV")}
        </button>
      </div>
      {q.isPending ? (
        <p role="status">{tr("Собираем статистику…")}</p>
      ) : q.isError ? (
        <div role="alert">
          <p>{tr(q.error.message)}</p>
          <button className="feed-chip" onClick={() => q.refetch()}>
            {tr("Повторить")}
          </button>
        </div>
      ) : (
        a && (
          <>
            <div className="admin-stats">
              {[
                ["Визиты", a.traffic.visits],
                ["Посетители", a.traffic.visitors],
                ["Мобильные", percent(a.traffic.mobile, a.traffic.visits)],
                ["Новые аккаунты", a.accounts.total],
                [
                  "Контакт подтверждён",
                  percent(a.accounts.verified, a.accounts.total),
                ],
                [
                  "Аккаунты / посетители",
                  percent(a.accounts.total, a.traffic.visitors),
                ],
              ].map(([label, value]) => (
                <div className="admin-stat" key={label}>
                  <strong>{tr(value)}</strong>
                  <span>{tr(label)}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {tr(
                "Трафик — только посетители, разрешившие аналитику. Аккаунты и записи — все данные базы. Соотношение этих показателей не является точной конверсией. Дни считаются по времени Астаны.",
              )}
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="workspace-panel">
                <h2 className="text-lg font-semibold">
                  {tr("Воронка новых участников")}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {tr(
                    "Последовательность действий новых участников с согласием на аналитику. Существующие аккаунты не входят в этап создания аккаунта.",
                  )}
                </p>
                {[
                  "visitors",
                  "activity_views",
                  "register_clicks",
                  "accounts",
                  "registrations",
                ]
                  .map((k) => [k, a.funnel[k]] as const)
                  .map(([key, n]) => (
                    <div
                      key={key}
                      className="flex justify-between border-b border-white/10 py-3"
                    >
                      <span>{tr(labels[key])}</span>
                      <strong>{n}</strong>
                    </div>
                  ))}
              </section>
              <section className="workspace-panel">
                <h2 className="text-lg font-semibold">
                  {tr("Источники визитов")}
                </h2>
                {a.sources.length ? (
                  a.sources.map((s) => (
                    <div
                      className="flex justify-between border-b border-white/10 py-3"
                      key={s.source}
                    >
                      <span>{tr(labels[s.source])}</span>
                      <strong>{s.visits}</strong>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-muted-foreground">
                    {tr("Пока нет посещений с согласием на аналитику.")}
                  </p>
                )}
                <h3 className="mt-6 font-semibold">
                  {tr("Активные аккаунты")}
                </h3>
                <p className="mt-2">
                  {tr("День: ")}
                  {a.active.dau}
                  {tr(" · Неделя: ")}
                  {a.active.wau}
                  {tr(" · Месяц:")}
                  {tr(" ")}
                  {a.active.mau}
                </p>
              </section>
            </div>
            <section className="workspace-panel">
              <h2 className="text-lg font-semibold">
                {tr("Регистрации по дням")}
              </h2>
              <div className="mt-4 overflow-x-auto">
                <div
                  className="flex h-40 min-w-max items-end gap-2"
                  role="img"
                  aria-label={tr("График новых аккаунтов по дням")}
                >
                  {a.daily.map((d) => (
                    <div
                      key={d.day}
                      className="flex h-full w-8 flex-col justify-end text-center text-xs"
                    >
                      <span>{d.accounts}</span>
                      <div
                        className="mt-1 rounded-t bg-brand"
                        style={{
                          height: `${Math.max(2, (d.accounts / Math.max(1, ...a.daily.map((x) => x.accounts))) * 110)}px`,
                        }}
                      />
                      <span className="mt-2">{tr(d.day.slice(8))}</span>
                    </div>
                  ))}
                </div>
              </div>
              <details className="mt-4">
                <summary>{tr("Таблица по дням")}</summary>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">{tr("Дата")}</th>
                      <th>{tr("Аккаунты")}</th>
                      <th>{tr("Визиты")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.daily.map((d) => (
                      <tr key={d.day}>
                        <td>{tr(d.day)}</td>
                        <td className="text-center">{d.accounts}</td>
                        <td className="text-center">{d.visits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="workspace-panel">
                <h2 className="font-semibold">{tr("Участие")}</h2>
                <p className="mt-3">
                  {tr("Записей: ")}
                  {a.activity.registrations}
                </p>

                <p>
                  {tr("Отмены: ")}
                  {a.activity.cancelled}
                  {tr(" · Неявки: ")}
                  {a.activity.no_show}
                </p>
              </section>
              <section className="workspace-panel">
                <h2 className="font-semibold">{tr("Организаторы")}</h2>
                <p className="mt-3">
                  {tr("Заявки: ")}
                  {a.organizers.applications}
                  {tr(" · Одобрено:")}
                  {tr(" ")}
                  {a.organizers.approved}
                </p>
                <p>
                  {tr("Создано событий: ")}
                  {a.organizers.events}
                </p>
                <p>
                  {tr("Заполняемость:")}
                  {tr(" ")}
                  {tr(percent(a.organizers.occupied, a.organizers.capacity))}
                </p>
              </section>
            </div>
            <section className="workspace-panel">
              <h2 className="font-semibold">{tr("Популярные страницы")}</h2>
              {a.pages.map((p) => (
                <div
                  className="flex justify-between gap-4 border-b border-white/10 py-3"
                  key={p.path}
                >
                  <span className="break-all">{tr(p.path)}</span>
                  <strong>{p.views}</strong>
                </div>
              ))}
              {!a.pages.length && (
                <p className="mt-3 text-muted-foreground">
                  {tr("Данных пока нет.")}
                </p>
              )}
            </section>
          </>
        )
      )}
    </section>
  );
}
