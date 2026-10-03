import { removeFiles, signFile, uploadFile } from "@/lib/files.functions";

export const RECEIPTS_BUCKET = "receipts";
export const AVATARS_BUCKET = "avatars";
export const SUPPORT_BUCKET = "support";
type Bucket =
  | typeof RECEIPTS_BUCKET
  | typeof AVATARS_BUCKET
  | typeof SUPPORT_BUCKET;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Only profile photos can be uploaded. Receipts and support attachments stored
// earlier stay readable through signedFileUrl.

/** Загружает фото профиля. Возвращает путь к файлу. */
export async function uploadAvatar(file: File): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Файл больше 5 МБ. Выберите фото меньше.");
  const form = new FormData();
  form.set("file", file);
  const { path } = await uploadFile({ data: form });
  return path;
}

/** Удаляет свои файлы; ошибки удаления не мешают основному действию. */
export async function deleteFiles(bucket: Bucket, paths: string[]) {
  if (!paths.length) return;
  await removeFiles({ data: { bucket, paths } }).catch(() => undefined);
}

/** Временная ссылка на закрытый файл (по умолчанию на 1 час). */
export async function signedFileUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  const { url } = await signFile({
    data: { bucket: bucket as Bucket, path, expiresIn },
  });
  return url;
}

export const signedReceiptUrl = (path: string) => signedFileUrl(RECEIPTS_BUCKET, path);
export const signedAvatarUrl = (path: string) => signedFileUrl(AVATARS_BUCKET, path);
