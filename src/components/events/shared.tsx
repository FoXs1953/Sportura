import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Event, EventHistory } from "@/lib/event-model";
import { eventEnd, escapeCsv } from "@/lib/event-model";
import { mutateEvent, type EventAction } from "@/lib/event.functions";
import {
  ACTIVITY_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  REGISTRATION_STATUS_LABEL,
} from "@/lib/sportura";

const historyStatuses: Record<string, string> = {
  ...ACTIVITY_STATUS_LABEL,
  ...PAYMENT_STATUS_LABEL,
  ...REGISTRATION_STATUS_LABEL,
  requested: "Запрошен",
  in_progress: "В обработке",
  approved: "Одобрен",
};
export {
  Panel,
  Empty,
  ErrorNotice,
  dateLabel,
} from "@/components/profile/shared";
export async function refreshEvents(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({
    predicate: (q) =>
      [
        "event-player",
        "event-host",
        "event-public",
        "event-feed",
        "activities",
        "activity",
        "my-registrations",
        "profile-workspace",
        "host",
        "me",
      ].includes(String(q.queryKey[0])),
  });
}
export function useEventAction() {
  const qc = useQueryClient();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>, message = "Сохранено") {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refreshEvents(qc);
      toast.success(message);
      return true;
    } catch (e) {
      const text = e instanceof Error ? e.message : "Не удалось сохранить";
      setError(text);
      toast.error(text);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return {
    run,
    busy,
    error,
    mutate: (
      action: EventAction,
      payload: Record<string, unknown>,
      message?: string,
    ) => run(() => mutateEvent({ data: { action, payload } }), message),
  };
}
export function Confirm({
  open,
  title,
  description,
  children,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  description: string;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? "Сохраняем…" : "Подтвердить"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Вернуться
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function downloadText(
  text: string,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCsv(rows: unknown[][], name: string) {
  downloadText(
    "\uFEFF" + rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n"),
    name,
    "text/csv;charset=utf-8",
  );
}
export function CalendarButton({ event }: { event: Event }) {
  if (!event.date_time) return null;
  const clean = (s: string) =>
    s
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  const stamp = (v: number) =>
    new Date(v)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        downloadText(
          [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Sportura//Events//RU",
            "BEGIN:VEVENT",
            `UID:${event.id}@sportura.vercel.app`,
            `DTSTAMP:${stamp(Date.now())}`,
            `DTSTART:${stamp(new Date(event.date_time!).getTime())}`,
            `DTEND:${stamp(eventEnd(event)!)}`,
            `SUMMARY:${clean(event.title)}`,
            `LOCATION:${clean(event.location_text)}`,
            `URL:https://sportura.vercel.app/activity/${event.id}`,
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\r\n"),
          "sportura-game.ics",
          "text/calendar;charset=utf-8",
        )
      }
    >
      В календарь
    </Button>
  );
}
export function MapLink({ event }: { event: Event }) {
  return event.two_gis_url &&
    /^https:\/\/(2gis\.kz|go\.2gis\.com)\//.test(event.two_gis_url) ? (
    <a
      className="profile-link"
      href={event.two_gis_url}
      target="_blank"
      rel="noreferrer"
    >
      Маршрут ↗
    </a>
  ) : null;
}
export function History({ items }: { items: EventHistory[] }) {
  return (
    <div className="space-y-3">
      {items.length ? (
        items.map((h) => (
          <div key={h.id} className="profile-item">
            <strong>{h.action}</strong>
            {h.actor_name && (
              <p className="text-xs workspace-muted">{h.actor_name}</p>
            )}
            <p className="workspace-muted text-xs">
              {new Date(h.created_at).toLocaleString("ru-RU", {
                timeZone: "Asia/Almaty",
              })}
            </p>
            {Object.entries(h.detail)
              .filter(
                ([k, v]) =>
                  v !== null &&
                  ["reason", "status", "title", "from", "to"].includes(k),
              )
              .map(([k, v]) => (
                <p className="text-sm" key={k}>
                  {k === "from"
                    ? "Было: "
                    : k === "to"
                      ? "Стало: "
                      : k === "status"
                        ? "Статус: "
                        : ""}
                  {["status", "from", "to"].includes(k)
                    ? (historyStatuses[String(v)] ?? "Изменён")
                    : String(v)}
                </p>
              ))}
          </div>
        ))
      ) : (
        <p className="workspace-muted">Изменений пока нет.</p>
      )}
    </div>
  );
}
export function HelpLink({
  registration,
  activity,
  topic = "general",
  children = "Обратиться в поддержку",
}: {
  registration?: string;
  activity?: string;
  topic?: "general" | "payment" | "attendance" | "review";
  children?: React.ReactNode;
}) {
  return (
    <Link
      className="profile-link"
      to="/profile"
      search={{
        tab: "help",
        ...(registration ? { registration } : {}),
        ...(activity ? { activity } : {}),
        topic,
      }}
    >
      {children}
    </Link>
  );
}
