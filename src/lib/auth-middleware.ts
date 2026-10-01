import { createMiddleware } from "@tanstack/react-start";

/** Server functions using this require a valid session cookie. */
export const requireAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { currentCaller } = await import("./auth.server");
    const caller = await currentCaller();
    if (!caller) throw new Error("Unauthorized: sign in required");
    return next({ context: { caller } });
  },
);

/** Server functions using this work signed in or out. */
export const optionalAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { currentCaller } = await import("./auth.server");
    return next({ context: { caller: await currentCaller() } });
  },
);
