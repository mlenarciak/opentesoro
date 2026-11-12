FROM oven/bun:1.3.13 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1.3.13-slim
WORKDIR /app
COPY --from=build --chown=bun:bun /app/dist/server ./dist/server
COPY --from=build --chown=bun:bun /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=bun:bun /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./
RUN mkdir -p /data && chown bun:bun /data
USER bun
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/opentesoro.sqlite STATIC_DIR=/app/apps/web/dist
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e 'const r=await fetch("http://127.0.0.1:3000/health");process.exit(r.ok?0:1)'
CMD ["bun", "dist/server/index.js"]
