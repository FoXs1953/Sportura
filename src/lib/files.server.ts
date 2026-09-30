// File storage on the server's disk (STORAGE_DIR, default ./storage).
// storage.objects keeps one row per file, so the storage policies in
// supabase/migrations still decide who may upload, read and delete what.
// Files are served by /api/files/<bucket>/<name> with an expiring HMAC signature.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { asService, asUser, type Caller } from "./db.server";

export const BUCKETS = ["avatars", "receipts", "support"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const EXTENSION_MIME = Object.fromEntries(
  Object.entries(MIME_EXTENSION).map(([mime, ext]) => [ext, mime]),
);

const root = () =>
  path.resolve(process.env["STORAGE_DIR"] || path.join(process.cwd(), "storage"));

let fallbackSecret: Buffer | undefined;
function secret(): Buffer | string {
  const configured = process.env["FILE_URL_SECRET"];
  if (configured) return configured;
  if (!fallbackSecret) {
    console.warn("[files] FILE_URL_SECRET is not set; file links reset on restart");
    fallbackSecret = randomBytes(32);
  }
  return fallbackSecret;
}

const NAME = /^[0-9a-f-]{36}(\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/;

export function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value);
}

export function isObjectName(name: string): boolean {
  return NAME.test(name) && name.length <= 300;
}

function diskPath(bucket: Bucket, name: string): string {
  if (!isObjectName(name)) throw new Error("Некорректный путь к файлу");
  const base = path.join(root(), bucket);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) throw new Error("Некорректный путь к файлу");
  return full;
}

export function contentType(name: string): string {
  return EXTENSION_MIME[name.split(".").pop() ?? ""] ?? "application/octet-stream";
}

function signature(bucket: string, name: string, expires: number) {
  return createHmac("sha256", secret())
    .update(`${bucket}/${name}:${expires}`)
    .digest("base64url");
}

export function signedUrl(bucket: Bucket, name: string, seconds = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + seconds;
  return `/api/files/${bucket}/${name}?exp=${expires}&sig=${signature(bucket, name, expires)}`;
}

export function verifySignature(bucket: string, name: string, exp: string, sig: string) {
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires < Date.now() / 1000) return false;
  const expected = Buffer.from(signature(bucket, name, expires));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function filePath(bucket: Bucket, name: string): string {
  return diskPath(bucket, name);
}

/** Stores a file as the caller; the insert policy on storage.objects must allow it. */
export async function saveFile(caller: Caller, bucket: Bucket, name: string, file: File) {
  const [limits] = await asService(
    (tx) => tx<{ file_size_limit: number | null; allowed_mime_types: string[] | null }[]>`
      SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = ${bucket}`,
  );
  if (!limits) throw new Error("Хранилище недоступно");
  if (limits.file_size_limit && file.size > limits.file_size_limit)
    throw new Error("Файл слишком большой");
  if (limits.allowed_mime_types && !limits.allowed_mime_types.includes(file.type))
    throw new Error("Этот тип файла не поддерживается");
  const target = diskPath(bucket, name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await asUser(caller, async (tx) => {
    await tx`INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
             VALUES (${bucket}, ${name}, ${caller.userId}, ${caller.userId},
                     ${tx.json({ mimetype: file.type, size: file.size })})`;
    // Written inside the transaction: if the disk write fails, the row is rolled back.
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  });
}

/** Deletes the caller's files where the delete policy allows it. */
export async function removeFiles(caller: Caller, bucket: Bucket, names: string[]) {
  const valid = names.filter(isObjectName);
  if (!valid.length) return;
  const removed = await asUser(
    caller,
    (tx) => tx<{ name: string }[]>`
      DELETE FROM storage.objects WHERE bucket_id = ${bucket} AND name IN ${tx(valid)}
      RETURNING name`,
  );
  await Promise.all(removed.map((r) => rm(diskPath(bucket, r.name), { force: true })));
}

/** True when the select policy lets the caller read the file. */
export async function canRead(caller: Caller, bucket: Bucket, name: string) {
  if (!isObjectName(name)) return false;
  const rows = await asUser(
    caller,
    (tx) => tx`SELECT 1 FROM storage.objects WHERE bucket_id = ${bucket} AND name = ${name}`,
  );
  return rows.length > 0;
}

/** Links stored before self-hosting, or external avatars (Google), pass through. */
export function isExternal(value: string) {
  return /^https?:\/\//.test(value) || value.startsWith("/");
}
