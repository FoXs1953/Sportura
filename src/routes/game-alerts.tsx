import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, MapPin, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { useSessionUser } from "@/lib/use-session";
import { CITIES, SPORTS } from "@/lib/sportura";
import { getSiteContent } from "@/lib/cms.functions";
import {
  getGameAlertPreferences,
  subscribeToGameAlerts,
  unsubscribeFromGameAlerts,
} from "@/lib/game-alerts.functions";

const searchSchema = z.object({
  city: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .catch("Астана")
    .default("Астана")
    .transform((city) => (city === "all" ? "Астана" : city)),
  sport: z.string().trim().min(1).max(50).catch("all").default("all"),
});
export const Route = createFileRoute("/game-alerts")({
  validateSearch: (
    s: { city?: unknown; sport?: unknown } & SearchSchemaInput,
  ) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Уведомления о новых играх — Sportura" },
      {
        name: "description",
        content:
          "Выберите город и спорт, чтобы узнавать о новых играх в уведомлениях Sportura.",
      },
    ],
  }),
  component: GameAlerts,
});

function GameAlerts() {
  const { tr } = useI18n();
  const session = useSessionUser();
  const userId = session.data?.id;
  const requestedSelection = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const preferences = useQuery({
    queryKey: ["game-alert-preferences", userId],
    queryFn: () => getGameAlertPreferences(),
    enabled: !!userId,
    retry: false,
  });
  const site = useQuery({
    queryKey: ["site", "home"],
    queryFn: () => getSiteContent({ data: { page: "home" } }),
    retry: false,
  });
  const canonicalOptions = (values: string[]) => {
    const seen = new Set<string>();
    return values
      .map((value) => value.trim())
      .filter((value) => {
        const normalized = value.toLowerCase();
        if (!normalized || normalized === "all" || seen.has(normalized))
          return false;
        seen.add(normalized);
        return true;
      });
  };
  const cities = canonicalOptions([
    ...CITIES,
    ...(site.data?.catalog.cities ?? []),
  ]).filter((city) => city.length >= 2 && city.length <= 80);
  const sports = canonicalOptions([
    ...SPORTS,
    ...(site.data?.catalog.sports ?? []),
  ]);
  const selection = {
    city:
      cities.find(
        (city) => city.toLowerCase() === requestedSelection.city.toLowerCase(),
      ) ?? "Астана",
    sport:
      sports.find(
        (sport) =>
          sport.toLowerCase() === requestedSelection.sport.toLowerCase(),
      ) ?? "all",
  };
  const redirect = `/game-alerts?${new URLSearchParams(selection).toString()}`;
  const subscribed = preferences.data?.subscriptions.some(
    (s) => s.city === selection.city && s.sport === selection.sport,
  );

  async function save() {
    setBusy(true);
    try {
      await subscribeToGameAlerts({ data: selection });
      await qc.invalidateQueries({
        queryKey: ["game-alert-preferences", userId],
      });
      toast.success(tr("Подписка на новые игры сохранена"));
    } catch (error) {
      toast.error(
        tr(
          error instanceof Error
            ? error.message
            : "Не удалось сохранить подписку",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await unsubscribeFromGameAlerts({ data: { id } });
      await qc.invalidateQueries({
        queryKey: ["game-alert-preferences", userId],
      });
      toast.success(tr("Подписка отключена"));
    } catch (error) {
      toast.error(
        tr(
          error instanceof Error
            ? error.message
            : "Не удалось отключить подписку",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={tr("Уведомления о новых играх")}
      subtitle={tr("Узнайте, когда появится подходящая игра")}
      layout="compact"
    >
      <div className="workspace-panel space-y-6">
        <Bell className="h-8 w-8 text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {tr(
            "Выберите город и спорт. Когда организатор опубликует новую открытую игру, уведомление появится в вашем профиле Sportura.",
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="alert-city">{tr("Город")}</Label>
            <select
              id="alert-city"
              value={selection.city}
              disabled={busy}
              onChange={(e) =>
                void navigate({
                  search: { ...selection, city: e.target.value },
                  replace: true,
                })
              }
              className="w-full rounded-xl border border-input bg-background px-3 py-3"
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {tr(city)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="alert-sport">{tr("Вид спорта")}</Label>
            <select
              id="alert-sport"
              value={selection.sport}
              disabled={busy}
              onChange={(e) =>
                void navigate({
                  search: { ...selection, sport: e.target.value },
                  replace: true,
                })
              }
              className="w-full rounded-xl border border-input bg-background px-3 py-3"
            >
              <option value="all">{tr("Все виды спорта")}</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {tr(sport)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {session.isPending ? (
          <p role="status">{tr("Проверяем вход…")}</p>
        ) : session.isError ? (
          <div role="alert" className="space-y-3">
            <p>{tr("Не удалось проверить вход. Попробуйте ещё раз.")}</p>
            <Button variant="outline" onClick={() => void session.refetch()}>
              {tr("Повторить")}
            </Button>
          </div>
        ) : userId ? (
          <>
            <Button
              disabled={
                busy ||
                site.isPending ||
                preferences.isPending ||
                preferences.isError ||
                subscribed
              }
              onClick={() => void save()}
              className="w-full"
            >
              {tr(
                busy
                  ? "Сохраняем…"
                  : subscribed
                    ? "Вы уже подписаны"
                    : "Уведомлять о новых играх",
              )}
            </Button>
            {preferences.isError && (
              <div role="alert" className="space-y-3">
                <p>{tr("Не удалось загрузить подписки")}</p>
                <Button
                  variant="outline"
                  onClick={() => void preferences.refetch()}
                >
                  {tr("Повторить")}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              {tr(
                "Создайте аккаунт, чтобы сохранить подписку. Выбранные город и спорт сохранятся после входа.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup", redirect }}
                className="workspace-primary-link"
              >
                {tr("Создать аккаунт")}
              </Link>
              <Link to="/auth" search={{ redirect }} className="feed-chip">
                {tr("Войти")}
              </Link>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {tr(
            "Подписка не резервирует место. Уведомления приходят внутри Sportura; проверяйте профиль, когда заходите на сайт.",
          )}
        </p>
      </div>
      {userId && preferences.data && (
        <div className="workspace-panel mt-5 space-y-4">
          <h2 className="text-lg font-semibold">{tr("Ваши подписки")}</h2>
          {!preferences.data.games_enabled && (
            <div role="status" className="rounded-xl bg-muted p-4 text-sm">
              <p>
                {tr(
                  "Уведомления об играх отключены в профиле. Включите их, чтобы получать сообщения по подпискам.",
                )}
              </p>
              <Link
                to="/profile"
                search={{ tab: "notifications" }}
                className="mt-2 inline-block underline"
              >
                {tr("Настройки уведомлений")}
              </Link>
            </div>
          )}
          {preferences.data.subscriptions.length ? (
            <ul className="space-y-3">
              {preferences.data.subscriptions.map((subscription) => (
                <li
                  key={subscription.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="break-words">
                      {tr(subscription.city)} ·{" "}
                      {tr(
                        subscription.sport === "all"
                          ? "Все виды спорта"
                          : subscription.sport,
                      )}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={busy}
                    onClick={() => void remove(subscription.id)}
                    aria-label={`${tr("Отключить подписку")}: ${tr(subscription.city)}, ${tr(subscription.sport === "all" ? "Все виды спорта" : subscription.sport)}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    <span>{tr("Отключить")}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {tr("Подписок пока нет. Выберите город и спорт выше.")}
            </p>
          )}
          <Link
            to="/profile"
            search={{ tab: "notifications" }}
            className="inline-block text-sm underline"
          >
            {tr("Открыть уведомления")}
          </Link>
        </div>
      )}
      <Link to="/" className="mt-5 inline-block text-sm underline">
        {tr("К ленте")}
      </Link>
    </AppShell>
  );
}
