FROM oven/bun:1.2.18-alpine

WORKDIR /app

COPY package.json package.json
RUN bun install --production

COPY src src

ENV OPENCUT_BASE_URL=http://web:3000

CMD ["bun", "src/stdio.ts"]

