# 07: Deploy no VPS

**What to build:** O sistema roda no VPS com Podman (compose): Next.js, worker (mesmo que ainda vazio), Postgres 17 com pgvector, e Evolution API com Redis, com arquivos no Cloudflare R2. Permite testar o fluxo com um WhatsApp real logo após a conexão estar pronta. O `compose.yaml` atual é a base.

**Blocked by:** 06 (Conectar WhatsApp)

**Status:** ready-for-human

- [x] O compose sobe todos os serviços no Podman com variáveis vindas de `.env` (com `.env.example` atualizado)
- [x] Migrations rodam no deploy
- [ ] Webhook da Evolution API chega ao app no VPS
- [ ] Um corretor real conecta o WhatsApp no ambiente do VPS e uma mensagem de número novo cria um negócio
- [ ] Uploads vão para o R2 (a imagem do app roda no runtime do Bun, exigido pelo `S3Client` nativo)
- [x] Passo a passo de deploy documentado
- [ ] Variáveis `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` configuradas no VPS e o primeiro administrador criado com `bun run admin:create`

## Comments

**Implementado (ticket 07).** `Containerfile` multi-stage (alvo `app`: Next `output: "standalone"` servido por `bun server.js`, usuário sem privilégio; alvo `tools`: fonte + node_modules para `migrate` e `worker`), `compose.yaml` com `postgres` → `migrate` (`service_completed_successfully`) → `app` + `worker`, `redis` → `evolution` (v2.3.7), e `caddy` opcional (profile `proxy`, HTTPS automático). `src/worker/index.ts` só registra um heartbeat por minuto. `.env.example` lista todas as variáveis; `docs/deploy.md` tem o passo a passo.

Decisões: Evolution usa o mesmo Postgres do CRM num banco `evolution` separado (criado por `deploy/postgres/init-evolution.sh` no primeiro boot) em vez do Postgres 15 extra do compose oficial dela; Evolution não é exposta (só loopback), o app a chama por `http://evolution:8080`; o webhook continua configurado por instância pelo app (`APP_URL/api/webhooks/evolution` + `x-webhook-secret`), por isso `WEBHOOK_GLOBAL_ENABLED=false`; `next build` roda no container com env fictícia, já que `next.config.ts` valida `src/lib/env.ts` (nada é embutido no bundle).

Verificado localmente (WSL2, Podman 4.9 + docker-compose como provider): `podman compose config` (com e sem o profile `proxy`), build das duas imagens e subida da stack completa (`postgres`, `migrate` com exit 0 e 11 tabelas, `app` respondendo `/login` 200 e `/api/webhooks/evolution` 401 sem segredo / 200 com segredo, `worker` com heartbeat, `redis`, `evolution` v2.3.7 com Prisma migrado no banco `evolution` e alcançável do container do app em `http://evolution:8080`; `Bun.S3Client` disponível na imagem do app). Caixas não marcadas dependem de um VPS real:

**O que o humano precisa fazer** (siga `docs/deploy.md`):
1. Provisionar o VPS, instalar Podman, apontar o DNS e preencher o `.env` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `POSTGRES_PASSWORD`, `APP_DOMAIN`/`CADDY_EMAIL`).
2. `podman compose --profile proxy up -d --build` e conferir `podman compose logs migrate`.
3. `podman compose run --rm migrate bun run admin:create <email> <senha> <nome>` e marcar a última caixa.
4. Conectar um WhatsApp real pelo `/painel/whatsapp`, confirmar `POST /api/webhooks/evolution 200` nos logs do app e que uma mensagem de número novo cria um negócio; marcar as caixas 3 e 4.
5. R2: validar uploads com as credenciais configuradas; o código de storage foi implementado no ticket 04 e a imagem roda no Bun.
