import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";

export type GameAlertSubscription = {
  id: string;
  city: string;
  sport: string;
  created_at: string;
};
export type GameAlertWorkspace = {
  subscriptions: GameAlertSubscription[];
  games_enabled: boolean;
};

export const getGameAlertPreferences = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<GameAlertWorkspace> => {
    const { asUser } = await import("./db.server");
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<
          { result: GameAlertWorkspace }[]
        >`SELECT public.game_alert_preferences('get') AS result`,
    );
    return row!.result;
  });

export const subscribeToGameAlerts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        city: z.string().trim().min(2).max(80),
        sport: z.string().trim().min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean; id: string }> => {
    const { asUser } = await import("./db.server");
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<
          { result: { ok: boolean; id: string } }[]
        >`SELECT public.game_alert_preferences('subscribe', ${tx.json(data)}) AS result`,
    );
    return row!.result;
  });

export const unsubscribeFromGameAlerts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    const { asUser } = await import("./db.server");
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<
          { result: { ok: boolean } }[]
        >`SELECT public.game_alert_preferences('unsubscribe', ${tx.json(data)}) AS result`,
    );
    return row!.result;
  });
