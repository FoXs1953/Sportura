import { Link } from "@tanstack/react-router";
import { getProfileWorkspace } from "@/lib/profile.functions";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getHostTrust,
  setHostPartner,
} from "@/lib/competition-admin.functions";
import { ErrorNotice, useEventAction } from "../shared";
import { Button } from "@/components/ui/button";
export function OrganizerTrust({
  id,
  admin = false,
  firstSpark = false,
}: {
  id?: string;
  admin?: boolean;
  firstSpark?: boolean;
}) {
  const profile = useQuery({
    queryKey: ["profile-workspace"],
    queryFn: () => getProfileWorkspace(),
    enabled: !id,
  });
  const q = useQuery({
    queryKey: ["host-trust", id ?? "me"],
    queryFn: () => getHostTrust({ data: { id } }),
  });
  const a = useEventAction();
  const [note, setNote] = useState("");
  return (
    <div className="event-muted-box space-y-3 my-4">
      {q.data && (
        <>
          <h3 className="font-bold">
            Уровень:{" "}
            {
              {
                novice: "Новичок",
                verified: "Проверенный",
                partner: "Партнёр",
              }[q.data.level]
            }
          </h3>
          <p className="text-sm">
            До {q.data.limit} участников · Завершённых турниров без споров:{" "}
            {q.data.completed} · Оценка организатора: {q.data.rating || "—"}
          </p>
          <p className="workspace-muted text-xs">
            Проверенный уровень: три завершённых турнира без принятых или
            открытых споров и оценка от 4,5. Лиги доступны партнёрам после
            одобрения Sportura.
          </p>
        </>
      )}
      {!id && profile.data && (
        <div className="space-y-2 text-sm">
          <strong>Первые шаги</strong>
          <p>
            {profile.data.preferences.host_name &&
            profile.data.preferences.host_bio
              ? "✓"
              : "○"}{" "}
            Заполнить публичный профиль
          </p>
          <p>
            {profile.data.preferences.host_contact ? "✓" : "○"} Добавить ссылку
            для связи
          </p>
          <p>{firstSpark ? "✓" : "○"} Создать первый Spark</p>
          <Link
            className="profile-link"
            to="/profile"
            search={{ tab: "organizer" }}
          >
            Настроить профиль →
          </Link>
        </div>
      )}
      {q.error && <ErrorNotice message={q.error.message} />}
      {admin && id && q.data && (
        <form
          className="event-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await a.run(
                () =>
                  setHostPartner({
                    data: { id, enabled: q.data!.level !== "partner", note },
                  }),
                "Уровень обновлён",
              )
            ) {
              setNote("");
              void q.refetch();
            }
          }}
        >
          <label>
            Основание изменения уровня
            <input
              required
              minLength={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ссылка или номер согласованного договора"
            />
          </label>
          <Button disabled={a.busy} variant="outline">
            {q.data.level === "partner"
              ? "Снять статус партнёра"
              : "Подтвердить партнёрство"}
          </Button>
          <ErrorNotice message={a.error} />
        </form>
      )}
    </div>
  );
}
