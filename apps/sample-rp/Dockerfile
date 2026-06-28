FROM node:22-bookworm-slim AS deps

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

ENV NODE_ENV=production
EXPOSE 4000
USER node

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=6 \
  CMD node -e "const p=process.env.PORT||4000;fetch('http://localhost:'+p+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "pnpm --filter @keyforge/sample-rp start"]
