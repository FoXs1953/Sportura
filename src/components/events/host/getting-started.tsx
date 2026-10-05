import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { getProfileWorkspace } from "@/lib/profile.functions";
import type { HostDocument, HostWorkspace } from "@/lib/event-model";
import { Panel } from "../shared";
import "@/styles/host-start.css";

export function GettingStarted({
  data,
  onCreate,
  onDraft,
}: {
  data: HostWorkspace;
  onCreate: () => void;
  onDraft: (document: HostDocument) => void;
}) {
  const { tr } = useI18n();
  const profile = useQuery({
    queryKey: ["profile-workspace"],
    queryFn: () => getProfileWorkspace(),
    enabled: data.activities.length === 0,
  });
  if (data.activities.length > 0) return null;

  const draft = data.documents
    .filter((document) => document.kind === "draft" && !document.published_id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const prepareEvent = () => (draft ? onDraft(draft) : onCreate());
  const eventAction = draft ? "Продолжить черновик" : "Создать первое событие";
  const preferences = profile.data?.preferences;
  const steps = [
    {
      title: "Публичный профиль",
      description: "Название и описание помогут игрокам узнать вас.",
      done: Boolean(
        preferences?.host_name.trim() && preferences.host_bio.trim(),
      ),
    },
    {
      title: "Контакт для игроков",
      description: "Добавьте Telegram, чтобы участники могли задать вопрос.",
      done: Boolean(preferences?.host_contact?.trim()),
    },
  ];

  return (
    <Panel
      title={tr("Подготовьте первое событие")}
      description={tr(
        "Публичные данные помогут игрокам узнать вас и связаться с вами.",
      )}
    >
      <div className="host-start-footer">
        <Button onClick={prepareEvent}>
          {tr(eventAction)} <ArrowRight size={16} aria-hidden="true" />
        </Button>
        <p className="workspace-muted text-sm">
          {draft && <strong className="block mb-1">{draft.name}</strong>}
          {tr(
            "Черновик можно сохранить в аккаунте. Игроки увидят событие только после публикации.",
          )}
        </p>
      </div>
      {profile.data ? (
        <ol className="host-start-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Link
                to="/profile"
                search={{ tab: "organizer" }}
                className="host-start-step"
              >
                <span
                  className={`host-start-marker${step.done ? " is-done" : ""}`}
                  aria-hidden="true"
                >
                  {step.done ? <Check size={16} /> : index + 1}
                </span>
                <span className="host-start-copy">
                  <strong>{tr(step.title)}</strong>
                  <span>{tr(step.description)}</span>
                  {step.done && (
                    <span className="host-start-complete">
                      {tr("Выполнено")}
                    </span>
                  )}
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      ) : profile.isError ? (
        <div className="event-muted-box event-line" role="status">
          <p className="workspace-muted text-sm">
            {tr(
              "Не удалось проверить профиль. Подготовку события можно продолжить.",
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={profile.isFetching}
            onClick={() => void profile.refetch()}
          >
            {tr("Повторить")}
          </Button>
        </div>
      ) : (
        <p className="workspace-muted text-sm" role="status">
          {tr("Проверяем готовность профиля…")}
        </p>
      )}
    </Panel>
  );
}
