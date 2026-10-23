FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY . .
RUN pnpm install --frozen-lockfile
ENV VITE_MAP_API_BASE_URL=""
RUN pnpm --filter web build && pnpm --filter admin build && node deploy/build.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY deploy/server.mjs ./deploy/server.mjs
COPY deploy/auth.mjs deploy/login.html ./deploy/
COPY workers/migrations ./workers/migrations
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "deploy/server.mjs"]
