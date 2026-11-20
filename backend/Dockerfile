# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Pokunity backend — multi-stage build.
#   deps      : all dependencies (build + test tooling)
#   build     : compiles TypeScript to dist/
#   test      : test runner image (docker compose ... run --rm backend-test)
#   prod-deps : production dependencies only
#   runtime   : final image (default target): non-root, prod deps, tini as PID 1
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM deps AS test
COPY . .
RUN npm run build
CMD ["npm", "test"]

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --chown=node:node package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0555 ./docker-entrypoint.sh
USER node
EXPOSE 4000
# busybox wget (alpine) is used by the compose healthcheck on /api/v1/health
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
