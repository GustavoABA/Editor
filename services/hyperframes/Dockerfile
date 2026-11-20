# Test-only Alpine image, matching the Editor's production OS. The actual
# deployed Editor bundles these CLI files in apps/web/Dockerfile.
FROM node:22-alpine

RUN apk add --no-cache chromium ffmpeg font-dejavu
WORKDIR /opt/opencut-hyperframes
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./

RUN addgroup -S -g 10001 renderer && adduser -S -D -u 10001 -G renderer renderer
ENV CHROME_BIN=/usr/bin/chromium-browser \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    HYPERFRAMES_NO_UPDATE_CHECK=1 \
    HOME=/tmp

USER renderer
# Single-use CLI: no HTTP server, no listening socket.
ENTRYPOINT ["node", "server.mjs"]
