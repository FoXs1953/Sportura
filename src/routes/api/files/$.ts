import { createFileRoute } from "@tanstack/react-router";

// Serves stored files for links created by signedUrl() in files.server.ts.
export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { createReadStream } = await import("node:fs");
        const { stat } = await import("node:fs/promises");
        const { Readable } = await import("node:stream");
        const files = await import("@/lib/files.server");
        const splat = params._splat ?? "";
        const slash = splat.indexOf("/");
        const bucket = splat.slice(0, slash);
        const name = splat.slice(slash + 1);
        const query = new URL(request.url).searchParams;
        if (
          slash < 0 ||
          !files.isBucket(bucket) ||
          !files.isObjectName(name) ||
          !files.verifySignature(
            bucket,
            name,
            query.get("exp") ?? "",
            query.get("sig") ?? "",
          )
        ) {
          return new Response("Not found", { status: 404 });
        }
        const file = files.filePath(bucket, name);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) return new Response("Not found", { status: 404 });
        return new Response(
          Readable.toWeb(createReadStream(file)) as ReadableStream,
          {
            headers: {
              "content-type": files.contentType(name),
              "content-length": String(info.size),
              "cache-control": "private, max-age=3600",
              "content-disposition": "inline",
              "x-content-type-options": "nosniff",
            },
          },
        );
      },
    },
  },
});
