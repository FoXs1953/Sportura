export async function assertStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_staff");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Доступ только для лида или администратора.");
}
