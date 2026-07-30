FROM remote-docker.artifactory.dbgcloud.io/library/node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm_config_registry=https://registry.npmjs.org/ \
    npm_config_proxy=http://webproxy.deutsche-boerse.de:8080/ \
    npm_config_https_proxy=http://webproxy.deutsche-boerse.de:8080/ \
    npm ci
COPY . .
RUN npm run build

FROM remote-docker.artifactory.dbgcloud.io/library/node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm_config_registry=https://registry.npmjs.org/ \
    npm_config_proxy=http://webproxy.deutsche-boerse.de:8080/ \
    npm_config_https_proxy=http://webproxy.deutsche-boerse.de:8080/ \
    npm ci --omit=dev
COPY shared/ shared/
COPY proxy/ proxy/

COPY --from=build /app/dist/ dist/
COPY --from=build /app/dist-widget/ dist-widget/

ENV NODE_ENV=production
ENV PORT=4222

# Overridable at deploy time via ConfigMap / env
ENV AGENTS_DIR=/app/proxy/agents
ENV CORS_ORIGIN=*
# MCP_SERVERS_CONFIG: path to JSON file (default: /app/proxy/config/mcp-servers.json)
# MCP_SERVERS: inline JSON (takes priority over file)
# SYSTEM_PROMPT_FILE: path to custom system prompt text file

EXPOSE 4222

CMD ["node", "--import", "tsx", "proxy/server.ts"]
