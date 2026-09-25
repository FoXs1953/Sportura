import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        let database: "ok" | "unreachable" | "not_configured" = "not_configured";
        if (url && key) {
          try {
            const res = await fetch(`${url}/rest/v1/activities?select=id&limit=1`, {
              headers: { apikey: key },
            });
            database = res.ok ? "ok" : "unreachable";
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
