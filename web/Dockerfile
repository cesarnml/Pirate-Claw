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

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

CMD ["node", "build"]
