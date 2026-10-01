import type { Caller, Tx } from "./db.server";

/** Runs fn as the caller after checking the staff role (admin or moderator); RLS still applies. */
export async function asStaff<T>(caller: Caller, fn: (tx: Tx) => Promise<T>) {
  const { asUser } = await import("./db.server");
  return asUser(caller, async (tx) => {
    const [row] = await tx<
      { staff: boolean }[]
    >`SELECT public.is_staff() AS staff`;
    if (!row?.staff)
      throw new Error("Доступ только для лида или администратора.");
    return fn(tx);
  });
}
