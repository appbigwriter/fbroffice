# syntax=docker/dockerfile:1
# Build pela raiz do repositório (Easypanel). O aplicativo está em habblaud/.
# Para um contexto iniciado dentro de habblaud/, use habblaud/Dockerfile.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
WORKDIR /app
COPY habblaud/package.json habblaud/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY habblaud/ ./
RUN npm run build

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
ENV NODE_ENV=production \
    HABBLAUD_HOST=0.0.0.0 \
    HABBLAUD_PORT=4747 \
    HABBLAUD_IN_DOCKER=1 \
    HABBLAUD_DATA_DIR=/data \
    HABBLAUD_USAGE_DIR=/usage
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/LICENSE /app/NOTICE /app/THIRD_PARTY_NOTICES.txt ./
COPY --from=builder /app/dist ./dist
RUN apk add --no-cache git && npm install --global --no-audit --no-fund @openai/codex@0.165.0
COPY habblaud/vendor/codex/ /usr/local/share/licenses/codex/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4747
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4747/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server/index.js"]
