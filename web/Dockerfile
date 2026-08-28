# Build stage
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Runtime stage
FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 8888

ENV NODE_ENV=production
ENV PORT=8888
ENV HOST=0.0.0.0
ENV PIRATE_CLAW_API_URL=http://pirate-claw-daemon:5555
ENV PIRATE_CLAW_DAEMON_TOKEN_FILE=/volume1/pirate-claw/config/generated/daemon-api-write-token
ENV PIRATE_CLAW_SESSION_SECRET_FILE=/volume1/pirate-claw/config/auth/session-secret

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build"]
