import { removeFiles, signFile, uploadFile } from "@/lib/files.functions";

export const RECEIPTS_BUCKET = "receipts";
export const AVATARS_BUCKET = "avatars";
export const SUPPORT_BUCKET = "support";
type Bucket =
  | typeof RECEIPTS_BUCKET
  | typeof AVATARS_BUCKET
  | typeof SUPPORT_BUCKET;

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

async function upload(
  bucket: Bucket,
  file: File,
  registrationId?: string,
): Promise<string> {
  const form = new FormData();
  form.set("bucket", bucket);
  form.set("file", file);
  if (registrationId) form.set("registrationId", registrationId);
  const { path } = await uploadFile({ data: form });
  return path;
}

/** Загружает скриншот чека Kaspi в закрытое хранилище. Возвращает путь к файлу. */
export async function uploadReceipt(file: File, registrationId: string): Promise<string> {
  if (file.size > MAX_RECEIPT_BYTES) throw new Error("Файл больше 10 МБ. Сожмите изображение.");
  return upload(RECEIPTS_BUCKET, file, registrationId);
}

/** Загружает фото профиля. Возвращает путь к файлу. */
export async function uploadAvatar(file: File): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Файл больше 5 МБ. Выберите фото меньше.");
  return upload(AVATARS_BUCKET, file);
}

/** Загружает вложения обращения в поддержку. Возвращает пути к файлам. */
export async function uploadSupportFiles(files: File[]): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (const file of files) {
      if (file.size > MAX_RECEIPT_BYTES) throw new Error("Выберите изображение или PDF до 10 МБ");
      paths.push(await upload(SUPPORT_BUCKET, file));
    }
    return paths;
  } catch (e) {
    await deleteFiles(SUPPORT_BUCKET, paths);
    throw e;
  }
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
