import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        let database: "ok" | "unreachable" | "not_configured" = "not_configured";
        if (process.env["DATABASE_URL"]) {
          try {
            const { asAnon } = await import("@/lib/db.server");
            await asAnon((tx) => tx`SELECT id FROM public.activities LIMIT 1`);
            database = "ok";
          } catch {
            database = "unreachable";
          }
        }
        return Response.json(
          { status: database === "ok" ? "ok" : "degraded", database, time: new Date().toISOString() },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
