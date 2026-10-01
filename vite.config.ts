import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Server credentials stay in the server process; only VITE_* is exposed by Vite.
  for (const key of [
    "DATABASE_URL",
    "APP_URL",
    "STORAGE_DIR",
    "FILE_URL_SECRET",
    "SMTP_URL",
    "MAIL_FROM",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "CRON_SECRET",
    "CRON_SECRET_PREVIOUS",
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      dedupe: [
        "react",
        "react-dom",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tanstackStart({ server: { entry: "server" } }),
      // Vercel by default; the VPS image builds with NITRO_PRESET=node-server.
      ...(command === "build"
        ? [nitro({ preset: process.env["NITRO_PRESET"] || "vercel" })]
        : []),
      react(),
    ],
  };
});
