import { useI18n } from "@/lib/i18n";
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  LayoutDashboard,
  UserRound,
  Star,
  Bell,
  ShieldCheck,
  Trophy,
  LifeBuoy,
  Shield,
} from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/me.functions";
import { getProfileWorkspace } from "@/lib/profile.functions";
import { profileTabs, tabLabels, type ProfileTab } from "@/lib/profile-model";
import { sportImage } from "@/lib/sportura";
import { signedAvatarUrl } from "@/lib/storage";
import {
  UnsavedChanges,
  ErrorNotice,
  errorText,
} from "@/components/profile/shared";
import { OverviewTab } from "@/components/profile/overview";
import { PersonalTab } from "@/components/profile/personal";
import { RatingTab } from "@/components/profile/rating";
import { NotificationsTab } from "@/components/profile/notifications";
import { SecurityTab } from "@/components/profile/security";
import { OrganizerTab } from "@/components/profile/organizer";
import { HelpTab, type TicketDraft } from "@/components/profile/support";
import "@/styles/profile.css";
const searchSchema = z.object({
  tab: z.enum(profileTabs).optional().catch(undefined),
  registration: z.string().uuid().optional().catch(undefined),
  activity: z.string().uuid().optional().catch(undefined),
  review: z.string().uuid().optional().catch(undefined),
  topic: z
    .enum(["general", "payment", "attendance", "review"])
    .optional()
    .catch(undefined),
  ticket: z.string().uuid().optional().catch(undefined),
});
export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: (
    search: {
      tab?: string;
      ticket?: string;
      registration?: string;
      activity?: string;
      review?: string;
      topic?: string;
    } & SearchSchemaInput,
  ) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Профиль — Sportura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Profile,
});
const icons = {
  overview: LayoutDashboard,
  personal: UserRound,
  rating: Star,
  notifications: Bell,
  security: ShieldCheck,
  organizer: Trophy,
  help: LifeBuoy,
};
function Profile() {
  const { tr } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = search.tab ?? "overview";
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const workspace = useQuery({
    queryKey: ["profile-workspace"],
    queryFn: () => getProfileWorkspace(),
    enabled: !!me.data,
    refetchInterval: 30000,
  });
  const [avatar, setAvatar] = useState("");
  const [draft, setDraft] = useState<TicketDraft>();
  const linkedDraft: TicketDraft | undefined =
    search.registration || search.activity || search.review
      ? {
          topic: search.topic ?? "general",
          subject: tr("Вопрос по событию"),
          ...(search.registration
            ? { registration_id: search.registration }
            : {}),
          ...(search.activity ? { activity_id: search.activity } : {}),
          ...(search.review ? { review_id: search.review } : {}),
        }
      : undefined;
  useEffect(() => {
    if (search.tab) {
      try {
        localStorage.setItem(
          `sportura-profile-tab:${me.data?.id ?? ""}`,
          search.tab,
        );
      } catch {
        /* Tab memory is optional when browser storage is unavailable. */
      }
      return;
    }
    if (!me.data) return;
    try {
      const saved = localStorage.getItem(`sportura-profile-tab:${me.data.id}`);
      if (saved && profileTabs.includes(saved as ProfileTab))
        void navigate({
          search: { tab: saved as ProfileTab },
          replace: true,
          resetScroll: false,
        });
    } catch {
      /* Tab memory is optional when browser storage is unavailable. */
    }
  }, [search.tab, me.data, navigate]);
  useEffect(() => {
    let live = true;
    if (me.data?.avatar_url)
      void signedAvatarUrl(me.data.avatar_url)
        .then((url) => {
          if (live) setAvatar(url);
        })
        .catch(() => {
          if (live) setAvatar("");
        });
    else setAvatar("");
    return () => {
      live = false;
    };
  }, [me.data?.avatar_url]);
  function go(next: ProfileTab) {
    void navigate({ search: { tab: next }, resetScroll: false });
  }
  function report(value: TicketDraft) {
    setDraft(value);
    go("help");
  }
  const user = me.data;
  const data = workspace.data;
  const count = data?.notifications.filter((n) => !n.read_at).length ?? 0;
  return (
    <AppShell
      workspace
      title={tr("Профиль")}
      subtitle={tr("Ваш спорт. Ваши настройки. Ваша команда.")}
    >
      {me.isPending || (!workspace.isError && !data && !!user) ? (
        <div className="profile-layout" aria-label={tr("Загружаем профиль")}>
          <div className="workspace-panel h-80 animate-pulse" />
          <div className="workspace-panel h-96 animate-pulse" />
        </div>
      ) : me.isError || workspace.isError || !user || !data ? (
        <div className="workspace-panel p-6">
          <h2 className="workspace-section-title">
            {tr("Не удалось загрузить профиль")}
          </h2>
          <ErrorNotice message={tr(errorText(me.error ?? workspace.error))} />
          <Button
            onClick={() => {
              void me.refetch();
              void workspace.refetch();
            }}
          >
            {tr("Повторить")}
          </Button>
          <Link className="profile-link ml-4" to="/my-games">
            {tr("Мои игры")}
          </Link>
        </div>
      ) : (
        <UnsavedChanges>
          <div className="profile-layout">
            <aside className="workspace-panel profile-sidebar">
              <img
                className="profile-cover"
                src={sportImage(user.sports[0] ?? "Футбол")}
                alt={tr("")}
              />
              <div className="profile-identity">
                <div className="profile-avatar">
                  {tr(
                    avatar ? (
                      <img src={avatar} alt={tr("")} />
                    ) : (
                      user.name.slice(0, 1)
                    ),
                  )}
                </div>
                <h2 className="mt-3 break-words text-base font-bold">
                  {tr(user.name)}
                </h2>
                <p className="workspace-muted mt-1 text-xs">{tr(user.city)}</p>
              </div>
              <nav className="profile-nav" aria-label={tr("Разделы профиля")}>
                {profileTabs.map((key) => {
                  const Icon = icons[key];
                  return (
                    <Link
                      key={key}
                      to="/profile"
                      search={{ tab: key }}
                      resetScroll={false}
                      aria-current={tab === key ? "page" : undefined}
                    >
                      <Icon size={17} />
                      {tr(tabLabels[key])}
                      {key === "notifications" && count > 0 && (
                        <span className="profile-badge-count">{count}</span>
                      )}
                    </Link>
                  );
                })}
                {user.roles.includes("admin") && (
                  <Link to="/admin">
                    <Shield size={17} />
                    {tr("Администрирование")}
                  </Link>
                )}
              </nav>
            </aside>
            <div className="profile-main" key={tab}>
              {tab === "overview" && (
                <OverviewTab me={user} data={data} go={go} />
              )}
              {tr(" ")}
              {tab === "personal" && <PersonalTab me={user} data={data} />}
              {tr(" ")}
              {tab === "rating" && <RatingTab data={data} report={report} />}
              {tr(" ")}
              {tab === "notifications" && (
                <NotificationsTab
                  data={data}
                  isHost={user.roles.some((r) => r !== "participant")}
                />
              )}
              {tr(" ")}
              {tab === "security" && (
                <SecurityTab me={user} data={data} report={report} />
              )}
              {tr(" ")}
              {tab === "organizer" && <OrganizerTab me={user} data={data} />}
              {tr(" ")}
              {tab === "help" && (
                <HelpTab
                  data={data}
                  {...(draft || linkedDraft
                    ? { draft: draft ?? linkedDraft }
                    : {})}
                  {...(search.ticket ? { ticketId: search.ticket } : {})}
                  onDone={() => setDraft(undefined)}
                />
              )}
            </div>
          </div>
        </UnsavedChanges>
      )}
    </AppShell>
  );
}
