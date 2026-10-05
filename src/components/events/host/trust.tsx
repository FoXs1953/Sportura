import { useI18n } from "@/lib/i18n";
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
}: {
  id?: string;
  admin?: boolean;
}) {
  const { tr } = useI18n();
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
            {tr("Уровень:")}
            {tr(" ")}
            {tr(
              {
                novice: "Новичок",
                verified: "Проверенный",
                partner: "Партнёр",
              }[q.data.level],
            )}
          </h3>
          <p className="text-sm">
            {tr(
              "До {limit} участников · Завершённых турниров без споров: {completed} · Оценка организатора: {rating}",
              {
                limit: q.data.limit,
                completed: q.data.completed,
                rating: q.data.rating || "—",
              },
            )}
          </p>
          <p className="workspace-muted text-xs">
            {tr(
              "Проверенный уровень: три завершённых турнира без принятых или открытых споров и оценка от 4,5. Лиги доступны партнёрам после одобрения Sportura.",
            )}
          </p>
        </>
      )}
      {q.error && <ErrorNotice message={tr(q.error.message)} />}
      {tr(
        admin && id && q.data && (
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
              {tr("Основание изменения уровня")}
              <input
                required
                minLength={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={tr("Ссылка или номер согласованного договора")}
              />
            </label>
            <Button disabled={a.busy} variant="outline">
              {tr(
                q.data.level === "partner"
                  ? "Снять статус партнёра"
                  : "Подтвердить партнёрство",
              )}
            </Button>
            <ErrorNotice message={tr(a.error)} />
          </form>
        ),
      )}
    </div>
  );
}
