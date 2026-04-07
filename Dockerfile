FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY bin/ bin/
COPY pirate-claw.config.json ./

ENTRYPOINT ["bun", "run", "src/cli.ts"]
CMD ["daemon"]
