import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";

const bucket = z.enum(["avatars", "receipts", "support"]);

/** multipart/form-data: bucket, file, and registrationId for receipts. */
export const uploadFile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Некорректный запрос");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Выберите файл");
    return {
      bucket: bucket.parse(input.get("bucket")),
      file,
      registrationId: z
        .string()
        .uuid()
        .optional()
        .parse(input.get("registrationId") ?? undefined),
    };
  })
  .handler(async ({ data, context }) => {
    const { saveFile, MIME_EXTENSION } = await import("./files.server");
    const { userId } = context.caller;
    const ext = MIME_EXTENSION[data.file.type];
    if (!ext) throw new Error("Выберите изображение или PDF");
    let name: string;
    if (data.bucket === "avatars") {
      name = `${userId}/avatar-${crypto.randomUUID()}.${ext}`;
    } else if (data.bucket === "receipts") {
      if (!data.registrationId) throw new Error("Не указана запись");
      name = `${userId}/${data.registrationId}/${Date.now()}.${ext}`;
    } else {
      name = `${userId}/${crypto.randomUUID()}.${ext}`;
    }
    await saveFile(context.caller, data.bucket, name, data.file);
    return { path: name };
  });

/** Temporary link to a private file the caller may read. */
export const signFile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        bucket,
        path: z.string().max(600),
        expiresIn: z.number().int().min(60).max(86400).default(3600),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const files = await import("./files.server");
    if (files.isExternal(data.path)) return { url: data.path };
    if (!(await files.canRead(context.caller, data.bucket, data.path)))
      throw new Error("Файл недоступен");
    return { url: files.signedUrl(data.bucket, data.path, data.expiresIn) };
  });

export const removeFiles = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ bucket, paths: z.array(z.string().max(300)).max(10) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const files = await import("./files.server");
    await files.removeFiles(context.caller, data.bucket, data.paths);
    return { ok: true };
  });
