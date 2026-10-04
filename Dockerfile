# Production and staging image: Node server build plus the database migration runner.
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g bun@1
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
ARG RELEASE_SHA=local
# Public build identity lets deployment checks detect a stale running app.
RUN node -e 'require("node:fs").writeFileSync("public/release.json", JSON.stringify({revision:process.env.RELEASE_SHA}) + "\n")'
RUN npx vite build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.output ./.output
# Migration runner: `node scripts/db-migrate.mjs` (postgres has no dependencies).
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY scripts/db-migrate.mjs ./scripts/
COPY db ./db
COPY supabase/migrations ./supabase/migrations
# Uploaded files; a named volume mounted here inherits this ownership.
ENV STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
