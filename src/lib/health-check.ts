/** A readiness check must fail when the application cannot read its database. */
export async function healthResponse(
  checkDatabase?: () => Promise<unknown>,
): Promise<Response> {
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";
  if (checkDatabase) {
    try {
      await checkDatabase();
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }

  return Response.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      time: new Date().toISOString(),
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
