FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg fonts-dejavu-core ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/opencut-hyperframes
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./
RUN useradd -u 10001 -m -s /usr/sbin/nologin renderer && \
    mkdir -p /work && chown -R renderer:renderer /work /opt/opencut-hyperframes

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium \
    HYPERFRAMES_NO_UPDATE_CHECK=1 \
    HYPERFRAMES_NO_TELEMETRY=1 \
    HOME=/home/renderer \
    PORT=8712

USER renderer
EXPOSE 8712
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
