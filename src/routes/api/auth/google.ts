import { createFileRoute } from "@tanstack/react-router";

// /api/auth/google?redirect=/path[&mode=link]
export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startGoogle } = await import("@/lib/google-oauth.server");
        return startGoogle(request);
      },
    },
  },
});
