import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const DISPUTE_WINDOW_HOURS = 48;
const NEEDS_REVIEW_ALERT_HOURS = 24;

async function runMaintenance() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const nowIso = now.toISOString();
  const report = {
    completedActivities: 0,
    closedRegistrations: 0,
    disputeWindowsOpened: 0,
    disputeWindowsClosed: 0,
    staleNeedsReview: 0,
  };

  // 1. Games/competitions whose start time has passed become completed.
  const finished = await supabaseAdmin
    .from("activities")
    .update({ status: "completed" })
    .lt("date_time", nowIso)
    .in("status", ["open", "nearly_full", "full"])
    .select("id, type");
  if (finished.error) throw new Error(finished.error.message);
  report.completedActivities = finished.data?.length ?? 0;

  // 2. Opening the 48h dispute window for competitions that just finished.
  const competitionIds = (finished.data ?? [])
    .filter((a) => a.type === "tournament" || a.type === "league")
    .map((a) => a.id);
  if (competitionIds.length) {
    const windowEnd = new Date(now.getTime() + DISPUTE_WINDOW_HOURS * 3600_000).toISOString();
    const opened = await supabaseAdmin
      .from("activities")
      .update({ dispute_window_ends_at: windowEnd })
      .in("id", competitionIds)
      .is("dispute_window_ends_at", null)
      .select("id");
    if (opened.error) throw new Error(opened.error.message);
    report.disputeWindowsOpened = opened.data?.length ?? 0;
  }

  // 3. Registration deadline passed -> activity is closed for new sign-ups.
  const closed = await supabaseAdmin
    .from("activities")
    .update({ status: "full" })
    .lt("registration_deadline", nowIso)
    .in("status", ["open", "nearly_full"])
    .select("id");
  if (closed.error) throw new Error(closed.error.message);
  report.closedRegistrations = closed.data?.length ?? 0;

  // 4. Dispute window finished: auto-close disputes that nobody escalated.
  const expired = await supabaseAdmin
    .from("activities")
    .select("id")
    .lt("dispute_window_ends_at", nowIso);
  if (expired.error) throw new Error(expired.error.message);
  const expiredIds = (expired.data ?? []).map((a) => a.id);
  if (expiredIds.length) {
    const closedDisputes = await supabaseAdmin
      .from("disputes")
      .update({
        status: "closed",
        admin_notes: "Закрыт автоматически: окно споров (48 часов) истекло.",
        resolved_at: nowIso,
      })
      .in("activity_id", expiredIds)
      .eq("status", "open")
      .select("id");
    if (closedDisputes.error) throw new Error(closedDisputes.error.message);
    report.disputeWindowsClosed = closedDisputes.data?.length ?? 0;
  }

  // 5. Count payments stuck in "needs_review" for more than 24h (admin signal).
  const staleSince = new Date(now.getTime() - NEEDS_REVIEW_ALERT_HOURS * 3600_000).toISOString();
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
            { ok: false, error: err instanceof Error ? err.message : "unknown" },
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
            { ok: false, error: err instanceof Error ? err.message : "unknown" },
            { status: 500 },
          );
        }
      },
    },
  },
});
