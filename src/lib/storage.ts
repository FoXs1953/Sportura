import { supabase } from "@/integrations/supabase/client";

export const RECEIPTS_BUCKET = "receipts";
export const AVATARS_BUCKET = "avatars";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function extOf(file: File): string {
  const parts = file.name.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Нужно войти в аккаунт.");
  return data.user.id;
}

/** Загружает скриншот чека Kaspi в закрытое хранилище. Возвращает путь к файлу. */
export async function uploadReceipt(file: File, registrationId: string): Promise<string> {
  if (file.size > MAX_RECEIPT_BYTES) throw new Error("Файл больше 10 МБ. Сожмите изображение.");
  const userId = await currentUserId();
  const path = `${userId}/${registrationId}/${Date.now()}.${extOf(file)}`;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, (file.type ? { upsert: true, contentType: file.type } : { upsert: true }));
  if (error) throw new Error(error.message);
  return path;
}

/** Загружает фото профиля. Возвращает путь к файлу. */
export async function uploadAvatar(file: File): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Файл больше 5 МБ. Выберите фото меньше.");
  const userId = await currentUserId();
  const path = `${userId}/avatar.${extOf(file)}`;
  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, (file.type ? { upsert: true, contentType: file.type } : { upsert: true }));
  if (error) throw new Error(error.message);
  return path;
}

/** Временная ссылка на закрытый файл (по умолчанию на 1 час). */
export async function signedFileUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  if (/^https?:\/\//.test(path)) return path;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) throw new Error(error?.message ?? "Файл недоступен");
  return data.signedUrl;
}

export const signedReceiptUrl = (path: string) => signedFileUrl(RECEIPTS_BUCKET, path);
export const signedAvatarUrl = (path: string) => signedFileUrl(AVATARS_BUCKET, path);
