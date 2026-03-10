FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ src/
COPY proxy/ proxy/
RUN npm run build

FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY proxy/ proxy/

COPY --from=build /app/dist/ dist/

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
