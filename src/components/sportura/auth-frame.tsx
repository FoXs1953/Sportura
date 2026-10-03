import { useI18n } from "@/lib/i18n";
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarDays, UsersRound } from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { sportImage } from "@/lib/sportura";
export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <AppShell
      title={tr(title)}
      subtitle={tr(subtitle)}
      layout="wide"
      showBrandBadge={false}
    >
      <div className="auth-layout">
        <div className="auth-content">{tr(children)}</div>
        <aside
          className="auth-visual"
          aria-label={tr("Игра начинается с тебя")}
        >
          <img
            src={sportImage("Футбол")}
            alt={tr("")}
            width={900}
            height={1100}
          />
          <div className="auth-visual-shade" />
          <div className="auth-visual-top">
            <span>{tr("SPORTURA / СООБЩЕСТВО")}</span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </div>
          <div className="auth-visual-bottom">
            <p>{tr("Твоя следующая игра ближе, чем кажется.")}</p>
            <div>
              <span>
                <CalendarDays size={16} aria-hidden="true" />
                {tr(" Находи игры")}
              </span>
              <span>
                <UsersRound size={16} aria-hidden="true" />
                {tr(" Играй вместе")}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
