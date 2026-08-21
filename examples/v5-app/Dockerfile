# ---------- stage 1: pack the plugin as a tarball, the way a real npm install would ----------
# Done here instead of COPYing dist/ straight in because the tarball is the only thing that
# proves the `files` allowlist and the `exports` map travel together — the same reasoning
# examples/v5-app/scripts/e2e.sh uses for local development and CI.
#
# This stage's fully-installed pnpm workspace (/repo) is also carried into the runtime stage
# below to run tools/line-mock as a second process — see Ruling E in
# .superpowers/sdd/2026-08-20-line-rich-menu-04-v5-and-release/AMENDMENT-14-15-16.md and
# docs/DEMO.md ("Why the demo talks to a mock").
FROM node:20.20.0-bookworm-slim AS plugin
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY tools ./tools
RUN pnpm install --frozen-lockfile --ignore-scripts=false
RUN pnpm --filter @fosivo/line-rich-menu-core --filter @fosivo/line-rich-menu-ui --filter strapi-plugin-line-rich-menu build
RUN cd packages/strapi-v5 && npm pack --pack-destination /tmp

# ---------- stage 2: build the Strapi admin panel ----------
# examples/v5-app installs with npm, not pnpm — it stands in for what a real customer's app
# looks like, not a workspace package, so the plugin goes in as the tarball packed above.
#
# package.json declares the plugin as `"strapi-plugin-line-rich-menu": "file:.pack/
# strapi-plugin-line-rich-menu.tgz"`, so that exact path must exist *before* npm resolves it —
# npm reads `file:` dependencies from disk, not from package-lock.json alone.
#
# `npm ci` cannot be used here: the committed package-lock.json deliberately has no resolved
# entry for that dependency (examples/v5-app/scripts/e2e.sh explains why — a committed
# integrity hash for a tarball that gets repacked on every build would pin yesterday's plugin
# code, or fail outright with EINTEGRITY), and `npm ci` refuses to run against a lockfile that
# does not fully match package.json. `npm install` still uses the lockfile as a strong hint
# for every *other* dependency's exact version, so this does not reopen the door to drift —
# proved by running `pnpm e2e:v5` (35/35) locally right after this file was written, see
# task-15-report.md.
FROM node:20.20.0-bookworm-slim AS build
WORKDIR /app
COPY examples/v5-app/package.json examples/v5-app/package-lock.json ./
COPY examples/v5-app/providers ./providers
COPY --from=plugin /tmp/strapi-plugin-line-rich-menu-[0-9]*.tgz ./.pack/strapi-plugin-line-rich-menu.tgz
RUN npm install --no-audit --no-fund --no-save
COPY examples/v5-app/config ./config
COPY examples/v5-app/src ./src
COPY examples/v5-app/public ./public
ENV NODE_ENV=production
# Peak RSS of this exact command, measured on both macOS and linux/amd64 (docker build), is
# recorded in docs/DEMO.md ("Why the image is built in CI") next to Render free's 512 MB —
# read that section before assuming Vite is cheap enough to run on Render's own instance.
RUN npm run build

# ---------- stage 3: runtime ----------
FROM node:20.20.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=1337
COPY --from=build --chown=node:node /app /app
# Carries the plugin stage's already-installed pnpm workspace forward so tools/line-mock can
# run as-is (fastify + sharp + tsx + the built @fosivo/line-rich-menu-core it imports) — see
# docker-entrypoint.sh and Ruling E.
COPY --from=plugin --chown=node:node /repo /repo
COPY --chown=node:node --chmod=755 examples/v5-app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# demo เปิดสาธารณะ — process ที่รันเป็น root ในคอนเทนเนอร์ที่รับคำขอจากอินเทอร์เน็ตคือ
# การขยายผลของช่องโหว่ใด ๆ ที่อาจมี ไม่ใช่แค่พิธีกรรม
USER node
EXPOSE 1337
ENTRYPOINT ["docker-entrypoint.sh"]
