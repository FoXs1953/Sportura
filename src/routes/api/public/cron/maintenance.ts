import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const DISPUTE_WINDOW_HOURS = 48;
const NEEDS_REVIEW_ALERT_HOURS = 24;

async function runMaintenance() {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const now = new Date();
  const nowIso = now.toISOString();
  const report = {
    completedActivities: 0,
    closedRegistrations: 0,
    disputeWindowsOpened: 0,
    disputeWindowsClosed: 0,
    staleNeedsReview: 0,
  };

  // Event completion is explicit; registration eligibility is checked by date and deadline.
  // Open disputes require a human decision, even after the submission window closes.
  const maintenance = await supabaseAdmin.rpc("profile_maintenance");
  if (maintenance.error) throw new Error(maintenance.error.message);

  // 5. Count payments stuck in "needs_review" for more than 24h (admin signal).
  const staleSince = new Date(
    now.getTime() - NEEDS_REVIEW_ALERT_HOURS * 3600_000,
  ).toISOString();
  const stale = await supabaseAdmin
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "needs_review")
    .lt("updated_at", staleSince);
  if (stale.error) throw new Error(stale.error.message);
  report.staleNeedsReview = stale.count ?? 0;

  return { ok: true, ranAt: nowIso, ...report };
}

export const Route = createFileRoute("/api/public/cron/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          return Response.json(await runMaintenance());
        } catch (err) {
          return Response.json(
            {
              ok: false,
              error: err instanceof Error ? err.message : "unknown",
            },
            { status: 500 },
          );
        }
      },
      GET: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          return Response.json(await runMaintenance());
        } catch (err) {
          return Response.json(
            {
              ok: false,
              error: err instanceof Error ? err.message : "unknown",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
