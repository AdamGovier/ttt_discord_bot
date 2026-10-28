FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bot.js app.js service.js store.js healthcheck.js ./
RUN mkdir -p /app/data && chown node:node /app/data

ENV BOT_HOST=0.0.0.0 \
    BOT_PORT=37405 \
    BOT_DATABASE_PATH=/app/data/database.json

USER node
EXPOSE 37405
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "healthcheck.js"]
CMD ["node", "bot.js"]
