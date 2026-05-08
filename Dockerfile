FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY bin/ bin/
COPY pirate-claw.config.example.json ./

RUN bun build src/cli.ts --outdir dist --target bun --format esm

ENV PIRATE_CLAW_INSTALL_ROOT=/volume1/pirate-claw
ENV PIRATE_CLAW_API_HOST=0.0.0.0
ENV PIRATE_CLAW_API_PORT=5555
ENV PIRATE_CLAW_TRANSMISSION_URL=http://transmission:9091/transmission/rpc

ENTRYPOINT ["bun", "run", "dist/cli.js"]
CMD ["daemon"]
