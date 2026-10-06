FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    STATE_DIR=/app/state
WORKDIR /app
RUN mkdir -p /app/state && chown -R node:node /app

USER node
COPY --from=builder --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder --chown=node:node /app/build ./build
# Fallback rounds while DATA_DIR (the pipeline's data/public, bind-mounted) is empty.
COPY --chown=node:node demo ./demo

EXPOSE 3000
# node:sqlite still prints an ExperimentalWarning on Node 24.
CMD ["node", "--disable-warning=ExperimentalWarning", "build"]
