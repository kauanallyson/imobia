# 06: Conectar WhatsApp

**What to build:** Um corretor lê e aceita o aviso de risco (conexão não oficial, número pode ser banido; ADR-0004), e o aceite é registrado com data e hora. Depois, lê um QR code e o número dele é conectado a uma instância da Evolution API. Ele vê o estado da conexão e consegue reconectar quando cair. Mensagens recebidas ficam guardadas numa conversa. Um número **sem histórico** com o corretor cria um cliente e um negócio em Novo; números conhecidos e grupos são ignorados. Conversas antigas não são importadas.

**Blocked by:** 02 (Login e página de administração)

**Status:** done

- [x] Sem aceite registrado, não é possível conectar
- [x] QR code é exibido e, após o pareamento, o estado mostra "conectado"; queda de conexão aparece e permite reconectar
- [x] Mensagem de número novo cria cliente + negócio em Novo e guarda a mensagem na conversa
- [x] Mensagem de número com histórico e mensagens de grupo não criam cliente nem negócio
- [x] Mensagens `fromMe` são guardadas com autor "corretor"
- [x] Nenhum histórico anterior à conexão é armazenado
- [x] Toda a integração passa por `src/lib/whatsapp.ts`; testes usam um falso (`mock.module`)
- [x] Webhook reentregue com a mesma mensagem (id da Evolution) não duplica mensagem, cliente nem negócio
- [x] Aceitar o aviso de novo não cria um segundo registro de aceite

## Comments

**2026-10-23 (aprendizados do 02):** a tela de conexão fica na área do corretor (`/painel`), protegida por `verificarCorretor`. O webhook é Route Handler (exceção prevista na spec) e não tem sessão de usuário: autentique pela Evolution e monte a sessão do corretor dono da instância. Dedupe por chave única no banco, não por consulta prévia.

**2026-10-23 (implementação):** uma linha em `whatsapp_conexoes` por corretor (PK `corretor_id`): o aceite é a própria linha (`aceite_em`), e `instancia`/`estado` são preenchidos quando ele pede o QR; sem a linha, `gerarQrCode` devolve `null`. A instância se chama `corretor-<id>` e é criada com `groupsIgnore: true`, `syncFullHistory: false` e webhook único (`CONNECTION_UPDATE`, `MESSAGES_UPSERT`) com header `x-webhook-secret` = `EVOLUTION_WEBHOOK_SECRET`; o Route Handler compara esse header (ou `?secret=`) e acha o corretor pela instância. Reconectar é só pedir um QR novo (`GET /instance/connect`). Envs novas obrigatórias: `APP_URL`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET` (atualize o `.env`). Tabelas `clientes`, `negocios` (+ `negocio_etapas`, etapas em snake_case), `conversas` e `mensagens` nasceram aqui no mínimo para a regra do número novo; o ticket 08 acrescenta o resto. Idempotência: `unique(conversa_id, evolution_id)` para a mensagem e `pg_advisory_xact_lock(corretor:telefone)` na transação para webhooks simultâneos do mesmo número novo. `fromMe` grava `ultima_mensagem_corretor_em`; pausar o assistente é do ticket 10. Fakes: `src/test/fakes/whatsapp.ts` + preload `src/test/fakes/preload.ts` (registrado no `bunfig.toml`); `parseWebhook` é puro e o falso reaproveita o real. Conferência no navegador contra uma Evolution real fica para o deploy (ticket 07); o build com Cache Components passa.
