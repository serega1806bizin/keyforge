FROM node:26-bookworm-slim AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/sample-rp/package.json apps/sample-rp/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
WORKDIR /app

COPY . .
RUN pnpm --filter @keyforge/server exec prisma generate
RUN pnpm --filter @keyforge/web build

ENV NODE_ENV=production
ENV SERVE_WEB=true
EXPOSE 3000
USER node

HEALTHCHECK --interval=15s --timeout=3s --start-period=25s --retries=6 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://localhost:'+p+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "pnpm --filter @keyforge/server exec prisma migrate deploy && (pnpm --filter @keyforge/server db:seed || echo 'seed skipped') && pnpm --filter @keyforge/server start"]
