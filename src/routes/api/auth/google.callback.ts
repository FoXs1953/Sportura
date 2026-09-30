import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishGoogle } = await import("@/lib/google-oauth.server");
        return finishGoogle(request);
      },
    },
  },
});
