# Deploy no VPS

O loteAI roda num VPS com Podman (`podman compose`), conforme a spec (§ Infraestrutura) e o ticket 07. Esta página é o passo a passo do zero até o primeiro WhatsApp conectado.

## O que sobe

| Serviço | Imagem | Papel |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | Banco do CRM (`crm`) e banco da Evolution (`evolution`), no mesmo servidor, com volume `postgres_data`. |
| `migrate` | `localhost/crm-tools` (alvo `tools` do `Containerfile`) | Roda `bun run db:migrate` e sai. `app` e `worker` só sobem depois dele terminar com sucesso (`service_completed_successfully`). |
| `app` | `localhost/crm-app` (alvo `app`) | Next.js em `output: "standalone"`, servido pelo Bun (`bun server.js`), porta 3000. |
| `worker` | `localhost/crm-tools` | `src/worker/index.ts`: processo de jobs agendados (hoje só um heartbeat por minuto; os tickets seguintes registram jobs). |
| `evolution` | `evoapicloud/evolution-api:v2.3.7` | Evolution API v2 (ADR-0004), com volume `evolution_instances`. |
| `redis` | `redis:7-alpine` | Cache da Evolution (`CACHE_REDIS_ENABLED=true`). |
| `caddy` (opcional, profile `proxy`) | `caddy:2-alpine` | Reverse proxy com HTTPS automático (Let's Encrypt) para `APP_DOMAIN`. |

Decisões:

- **Postgres compartilhado, bancos separados.** O compose oficial da Evolution sobe um Postgres 15 só para ela; aqui ela usa o mesmo servidor Postgres 17 do CRM, no banco `evolution` (criado por `deploy/postgres/init-evolution.sh` na primeira inicialização do volume) e no schema `evolution_api`, que o Prisma dela cria sozinho. Um processo a menos no VPS; o backup do volume cobre os dois.
- **Evolution não é pública.** Ela fica na rede do compose: o app chama `http://evolution:8080` e ela chama o app pela `APP_URL` pública. A porta 8080 só é publicada no loopback do VPS (`EVOLUTION_PORT`), para inspeção por túnel SSH.
- **Webhook por instância, configurado pelo app.** `src/lib/whatsapp.ts` cria cada instância com `webhook.url = APP_URL/api/webhooks/evolution` e o header `x-webhook-secret: EVOLUTION_WEBHOOK_SECRET`; o Route Handler rejeita com 401 se o header não bater. Por isso `WEBHOOK_GLOBAL_ENABLED=false` na Evolution e `APP_URL` precisa ser a URL que o container da Evolution alcança (no VPS, o domínio público; nunca `localhost`).
- **Build valida env.** `next.config.ts` importa `src/lib/env.ts`, então o `next build` dentro do `Containerfile` recebe valores fictícios. Nada é embutido no bundle; os valores reais entram em runtime pelo `.env`.
- **Imagens locais.** `podman compose up --build` constrói `crm-app` e `crm-tools` no próprio VPS; não há registry.

## 1. Preparar o VPS

Ubuntu 24.04 (ou Debian 12) com 2 vCPU / 4 GB é suficiente. Como um usuário com sudo:

```bash
sudo apt update && sudo apt install -y podman podman-compose git
# `podman compose` delega ao docker-compose se instalado; o podman-compose do apt basta.
systemctl --user enable --now podman.socket
# Containers precisam continuar após o logout do usuário:
sudo loginctl enable-linger "$USER"
# Caddy publica 80/443 em rootless: libere as portas baixas
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-podman-ports.conf
sudo sysctl --system
```

DNS: aponte `crm.exemplo.com.br` (registro A) para o IP do VPS antes de subir o Caddy; o certificado só é emitido com o DNS resolvendo.

## 2. Código e `.env`

```bash
git clone <repositório> ~/crm && cd ~/crm
cp .env.example .env
```

Edite o `.env`:

| Variável | Valor no VPS |
|---|---|
| `POSTGRES_PASSWORD` | senha forte (`openssl rand -hex 16`) |
| `DATABASE_URL` | só é usada fora dos containers; pode manter com a mesma senha e `localhost:5432` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` e `APP_URL` | `https://crm.exemplo.com.br` (com Caddy) ou `http://IP:3000` (sem) |
| `EVOLUTION_API_KEY` | `openssl rand -hex 32` |
| `EVOLUTION_WEBHOOK_SECRET` | `openssl rand -hex 24` |
| `APP_DOMAIN`, `CADDY_EMAIL` | só com o Caddy |
| `APP_PORT` | sem Caddy: `3000` (publica em todas as interfaces); com Caddy deixe o padrão (loopback) |

`EVOLUTION_API_URL` pode ficar como está: dentro do compose o app e o worker recebem `http://evolution:8080` por cima.

## 3. Subir

```bash
# com HTTPS automático:
podman compose --profile proxy up -d --build
# ou, sem proxy (http://IP:3000):
podman compose up -d --build

podman compose ps
podman compose logs migrate    # deve terminar com as migrations aplicadas
podman compose logs -f app worker
```

Ordem: `postgres` (healthcheck) → `migrate` → `app` e `worker`; `redis` → `evolution`. Toda atualização de código é `git pull && podman compose up -d --build`: o `migrate` roda de novo (idempotente) antes do app novo subir.

## 4. Primeiro administrador

O script roda na imagem `crm-tools`, que já tem o `DATABASE_URL` da rede do compose:

```bash
podman compose run --rm migrate bun run admin:create admin@exemplo.com.br 'senha-forte' 'Nome'
```

Entre em `https://crm.exemplo.com.br/admin`, crie a imobiliária e o corretor.

## 5. Conectar o primeiro WhatsApp

1. Entre como corretor em `/login` → `/painel` → WhatsApp.
2. Aceite o aviso de risco (ADR-0004) e peça a conexão: o app cria a instância na Evolution já com o webhook apontando para `APP_URL/api/webhooks/evolution`.
3. Leia o QR com o celular (Aparelhos conectados → Conectar um aparelho). O estado muda para conectado assim que o webhook `CONNECTION_UPDATE` chega.
4. Confirme que o webhook está chegando: `podman compose logs app | grep webhooks/evolution` deve mostrar `POST ... 200` (401 = segredo diferente entre `.env` e a instância; sem linha nenhuma = a Evolution não alcança `APP_URL`, veja abaixo).
5. Mande uma mensagem de um número que nunca falou com o corretor: um negócio novo aparece no funil.

Inspecionar a Evolution pelo manager, se precisar: `ssh -L 8080:127.0.0.1:8080 usuario@vps` e abra `http://localhost:8080/manager` com a `EVOLUTION_API_KEY`.

## Problemas comuns

- **Webhook não chega.** Dentro do container da Evolution, `APP_URL` precisa resolver e responder: `podman compose exec evolution wget -qO- $APP_URL/login`. Com o Caddy, use o domínio (o DNS público resolve para o VPS e o Caddy encaminha). Sem Caddy, use o IP público do VPS e `APP_PORT=3000`; `localhost` nunca funciona, porque aponta para o próprio container.
- **Porta 80/443 negada em rootless.** Aplique o `sysctl` do passo 1.
- **`migrate` falhou.** `podman compose logs migrate`; corrija e `podman compose up -d` de novo (o app só sobe com ele concluído).
- **Reset total (apaga dados!).** `podman compose down -v`.
- **Banco `evolution` não existe.** O script de init só roda num volume novo. Em volume antigo: `podman compose exec postgres psql -U postgres -c 'create database evolution'`.

## Verificado localmente (ticket 07)

`podman compose config`, `podman compose build` dos dois alvos e a subida da stack completa (inclusive Evolution v2.3.7 no Postgres compartilhado e o webhook respondendo 401/200 conforme o segredo) foram verificados em WSL2 com Podman 4.9. O que exige um VPS real está listado em `docs/specs/mvp/issues/07-deploy-no-vps.md` → Comments.
