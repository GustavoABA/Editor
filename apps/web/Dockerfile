FROM oven/bun:1.4.3-alpine AS base

FROM rust:alpine AS autocut-builder

WORKDIR /src

RUN apk add --no-cache musl-dev

COPY rust/crates/autocut rust/crates/autocut

RUN cargo build --manifest-path rust/crates/autocut/Cargo.toml --release --bin opencut-autocut

# Install HyperFrames CLI at image-build time. This is a dependency of the
# Editor, not a second container, daemon or public service.
FROM node:22-alpine AS hyperframes-cli-builder
WORKDIR /opt/opencut-hyperframes
COPY services/hyperframes/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/hyperframes/server.mjs ./

FROM base AS builder

WORKDIR /app

ARG FREESOUND_CLIENT_ID
ARG FREESOUND_API_KEY
ARG NEXT_PUBLIC_MARBLE_API_URL=https://api.marblecms.com
ARG MARBLE_WORKSPACE_KEY=build-placeholder

COPY package.json package.json
COPY bun.lock bun.lock
COPY turbo.json turbo.json

COPY apps/web/package.json apps/web/package.json
RUN bun install

COPY apps/web/ apps/web/

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time env stubs to pass zod validation
ENV DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut"
ENV BETTER_AUTH_SECRET="build-time-secret"
ENV UPSTASH_REDIS_REST_URL="http://localhost:8079"
ENV UPSTASH_REDIS_REST_TOKEN="example_token"
ENV NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ENV NEXT_PUBLIC_MARBLE_API_URL=$NEXT_PUBLIC_MARBLE_API_URL
ENV MARBLE_WORKSPACE_KEY=$MARBLE_WORKSPACE_KEY

ENV FREESOUND_CLIENT_ID=$FREESOUND_CLIENT_ID
ENV FREESOUND_API_KEY=$FREESOUND_API_KEY

WORKDIR /app/apps/web
RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN apk add --no-cache nodejs chromium ffmpeg font-dejavu mesa-egl mesa-gles mesa-dri-gallium xvfb xvfb-run
ENV HYPERFRAMES_NO_UPDATE_CHECK=1 \\
    CHROME_BIN=/usr/bin/chromium-browser \\
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN mkdir -p /app/render-jobs /app/automation /app/lan-sync \
	&& chown nextjs:nodejs /app/render-jobs /app/automation /app/lan-sync

COPY --from=autocut-builder /src/rust/crates/autocut/target/release/opencut-autocut /usr/local/bin/opencut-autocut
COPY --from=hyperframes-cli-builder --chown=nextjs:nodejs /opt/opencut-hyperframes /opt/opencut-hyperframes

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

RUN chown nextjs:nodejs apps

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "apps/web/server.js"]
