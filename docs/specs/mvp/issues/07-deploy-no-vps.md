# 07: Deploy no VPS

**What to build:** O sistema roda no VPS com Podman (compose): Next.js, worker (mesmo que ainda vazio), Postgres 17 com pgvector, e Evolution API com Redis, com arquivos no Cloudflare R2. Permite testar o fluxo com um WhatsApp real logo após a conexão estar pronta. O `docker-compose.yml` atual é a base.

**Blocked by:** 06 (Conectar WhatsApp)

**Status:** ready-for-agent

- [ ] O compose sobe todos os serviços no Podman com variáveis vindas de `.env` (com `.env.example` atualizado)
- [ ] Migrations rodam no deploy
- [ ] Webhook da Evolution API chega ao app no VPS
- [ ] Um corretor real conecta o WhatsApp no ambiente do VPS e uma mensagem de número novo cria um negócio
- [ ] Uploads vão para o R2 (a imagem do app roda no runtime do Bun, exigido pelo `S3Client` nativo)
- [ ] Passo a passo de deploy documentado
- [ ] Variáveis `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` configuradas no VPS e o primeiro administrador criado com `bun run admin:create`
