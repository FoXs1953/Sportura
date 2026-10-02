import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "@/lib/health-check";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        return healthResponse(
          process.env["DATABASE_URL"]
            ? async () => {
                const { asAnon } = await import("@/lib/db.server");
                await asAnon((tx) => tx`SELECT id FROM public.activities LIMIT 1`);
              }
            : undefined,
        );
      },
    },
  },
});
