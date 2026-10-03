import { useI18n } from "@/lib/i18n";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { PageBlocks } from "@/components/sportura/page-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findActivityByInvite } from "@/lib/activities.functions";
export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Закрытая игра по коду — Sportura" },
      {
        name: "description",
        content:
          "Введите код приглашения, чтобы открыть закрытую игру или турнир в Астане.",
      },
      { property: "og:title", content: "Закрытая игра по коду — Sportura" },
      {
        property: "og:description",
        content:
          "Приватные игры доступны только по коду приглашения от организатора.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sportura.vercel.app/join" },
    ],
    links: [{ rel: "canonical", href: "https://sportura.vercel.app/join" }],
  }),
  component: JoinByCode,
});
function JoinByCode() {
  const { tr } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    if (code.trim().length < 4) {
      toast.error(tr("Код слишком короткий"));
      return;
    }
    setBusy(true);
    try {
      const found = await findActivityByInvite({ data: { code: code.trim() } });
      if (!found) {
        toast.error(tr("Игра по такому коду не найдена"));
        return;
      }
      await navigate({
        to: "/activity/$id",
        params: { id: found.id },
        search: { code: code.trim() },
      });
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Не удалось открыть игру"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell
      title={tr("Закрытая игра")}
      subtitle={tr("Вход по коду приглашения")}
    >
      <PageBlocks page="join" />
      <div className="join-panel panel-frost space-y-4 rounded-3xl p-6">
        <p className="text-sm text-muted-foreground">
          {tr(
            "Организатор закрытой игры или турнира даёт код приглашения. Введите его — откроется страница игры, где можно записаться.",
          )}
        </p>
        <Label htmlFor="invite-code">{tr("Код приглашения")}</Label>
        <Input
          id="invite-code"
          value={code}
          disabled={busy}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void open();
          }}
          placeholder={tr("Например: ASTANA-FC-12")}
          autoCapitalize="characters"
        />
        <Button
          className="press w-full"
          disabled={busy}
          onClick={() => void open()}
        >
          {tr(busy ? "Ищем…" : "Открыть игру")}
        </Button>
      </div>
    </AppShell>
  );
}
