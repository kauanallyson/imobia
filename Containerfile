# Imagem de produção do loteAI. Dois alvos:
#   - `app`   (padrão): Next.js em `output: "standalone"`, servido pelo Bun
#               (`bun server.js`), exigido pelo S3Client nativo do storage.
#   - `tools`: código-fonte completo + node_modules; usado pelo serviço
#               `migrate` (drizzle-kit) e pelo `worker` (src/worker/index.ts).
#
# Ignorados no contexto: .dockerignore (lido pelo podman e pelo docker-compose).
# Build: podman build -t crm-app . && podman build --target tools -t crm-tools .
# O compose.yaml já faz isso (`build.target`).

FROM docker.io/oven/bun:1.4.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM deps AS tools
ENV NODE_ENV=production
COPY . .
# Scripts que importam src/data precisam de --conditions=react-server
# (server-only). O worker roda com a mesma condição.
CMD ["bun", "--conditions=react-server", "src/worker/index.ts"]

# ---------------------------------------------------------------------------
FROM deps AS build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY . .
# src/lib/env.ts valida as variáveis já no `next build` (next.config.ts
# importa o módulo). Nenhum valor é embutido no bundle (não há NEXT_PUBLIC_*);
# os valores reais entram só em runtime, pelo .env do compose.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=segredo-apenas-para-o-build-nao-usado-em-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    APP_URL=http://localhost:3000 \
    EVOLUTION_API_URL=http://localhost:8080 \
    EVOLUTION_API_KEY=build \
    EVOLUTION_WEBHOOK_SECRET=segredo-apenas-para-o-build \
    R2_ACCOUNT_ID=build R2_ACCESS_KEY_ID=build R2_SECRET_ACCESS_KEY=build R2_BUCKET=build \
    bun --bun next build

# ---------------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.4-alpine AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S nextjs && adduser -S -G nextjs nextjs
# Ticket 17: LibreOffice (só o Writer) converte a proposta DOCX em PDF
# (src/lib/documentos.ts chama `soffice --headless --convert-to pdf`). As
# fontes Liberation têm as mesmas métricas de Arial/Times/Courier, para o
# PDF sair com a paginação do modelo do Word.
RUN apk add --no-cache libreoffice-writer font-liberation font-dejavu
# standalone traz só os arquivos rastreados pelo build; public e static
# não entram por padrão (docs: output.md).
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["bun", "server.js"]
