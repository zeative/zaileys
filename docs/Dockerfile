# Self-hosted docs (https://zaileys.kejaa.id): builds the static export, then serves it with nginx.
# Build from the repository root:  docker build -f docs/Dockerfile .
# Deployed on Dokploy (build type: Dockerfile, file docs/Dockerfile, context '.'), container port 80.

FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
ENV HUSKY=0 CI=true

COPY package.json pnpm-lock.yaml ./
# Scripts off: the only package that builds (better-sqlite3) is a runtime dep the docs never load.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN node docs/scripts/build-static.mjs docs-dist \
  && node docs/scripts/build-nginx.mjs /repo/nginx.conf \
  && rm -rf docs-dist/.vercel docs-dist/vercel.json "docs-dist/Start Docs.bat" "docs-dist/Start Docs.command"

FROM nginx:1.27-alpine
COPY --from=build /repo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/docs-dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
