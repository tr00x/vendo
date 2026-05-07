FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal/package.json apps/portal/
COPY apps/bots/package.json apps/bots/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/portal/node_modules ./apps/portal/node_modules
COPY . .
WORKDIR /app/apps/portal
# Strip dev-only routes from the production build entirely so the seed
# credentials baked into the picker never ship to the browser as a static
# chunk. The server-side notFound() gate is defense-in-depth, not the
# only line of defense.
RUN rm -rf src/app/dev-login src/app/api/dev-login 2>/dev/null || true
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/portal/.next/standalone ./
COPY --from=build /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=build /app/apps/portal/public ./apps/portal/public
EXPOSE 3000
USER node
CMD ["node", "apps/portal/server.js"]
