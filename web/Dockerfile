# Build stage
FROM oven/bun:1 AS build

WORKDIR /app

COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile

COPY web/ .
RUN bun run build

# Runtime stage
FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 8888

ENV NODE_ENV=production
ENV PORT=8888
ENV HOST=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build"]
