import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { PageBlocks } from "@/components/sportura/page-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function open() {
    if (code.trim().length < 4) {
      toast.error("Код слишком короткий");
      return;
    }
    setBusy(true);
    try {
      const found = await findActivityByInvite({ data: { code: code.trim() } });
      if (!found) {
        toast.error("Игра по такому коду не найдена");
        return;
      }
      await navigate({
        to: "/activity/$id",
        params: { id: found.id },
        search: { code: code.trim() },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось открыть игру",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Закрытая игра" subtitle="Вход по коду приглашения">
      <PageBlocks page="join" />
      <div className="join-panel panel-frost space-y-4 rounded-3xl p-6">
        <p className="text-sm text-muted-foreground">
          Организатор закрытой игры или турнира даёт код приглашения. Введите
          его — откроется страница игры, где можно записаться.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void open();
          }}
          placeholder="Например: ASTANA-FC-12"
          autoCapitalize="characters"
        />
        <Button
          className="press w-full"
          disabled={busy}
          onClick={() => void open()}
        >
          {busy ? "Ищем…" : "Открыть игру"}
        </Button>
      </div>
    </AppShell>
  );
}
