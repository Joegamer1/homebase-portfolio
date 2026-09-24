FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-contracts/package.json ./packages/api-contracts/package.json
COPY packages/attention-engine/package.json ./packages/attention-engine/package.json
COPY packages/career-engine/package.json ./packages/career-engine/package.json
COPY packages/collectors/package.json ./packages/collectors/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY services/api/package.json ./services/api/package.json
ARG NEXT_PUBLIC_HOMEBASE_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_HOMEBASE_API_URL=$NEXT_PUBLIC_HOMEBASE_API_URL
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 homebase
COPY --from=build --chown=homebase:nodejs /app /app
USER homebase
EXPOSE 3000 4000
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
