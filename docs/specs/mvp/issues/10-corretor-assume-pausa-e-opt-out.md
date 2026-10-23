# 10: Corretor assume a conversa, pausa e opt-out

**What to build:** Quando o corretor responde pelo celular (`fromMe`), o assistente pausa naquela conversa. O corretor devolve a conversa ao assistente com um toque, ou ela é retomada automaticamente após 24h sem mensagem dele (verificado pelo worker). O corretor liga ou desliga o assistente por conversa. Se o cliente disser que não tem interesse, o assistente para de vez, nunca mais envia mensagem e o negócio vai para Perdido com motivo "sem interesse".

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** done

- [x] Mensagem `fromMe` pausa o assistente na conversa; mensagens seguintes do cliente não recebem resposta automática
- [x] "Devolver ao assistente" reativa a conversa
- [x] Após 24h sem mensagem do corretor, o assistente retoma (teste com `setSystemTime`)
- [x] Ligar/desligar por conversa funciona e desligado não retoma sozinho
- [x] Opt-out impede qualquer envio futuro e leva o negócio a Perdido com motivo "sem interesse"

## Comments

- Estado do assistente vive em `src/data/estado-do-assistente.ts` (re-exportado por `src/data/conversas.ts`): `buscarConversa`, `devolverAoAssistente`/`ligarAssistente` (→ ativo), `desligarAssistente` (→ desligado), `retomarAssistentesPausados()` (job, 24h desde `ultimaMensagemCorretorEm`) e `registrarOptOut`. Módulo separado para a ferramenta do assistente importar sem ciclo com `assistente.ts`.
- Pausa em `receberMensagem`: só uma mensagem `fromMe` **gravada agora** pausa (`ativo` → `pausado`). O eco das mensagens do próprio assistente também é `fromMe`, mas já foi gravado pelo id da Evolution ao enviar e cai no conflito da unique, então não pausa (testado). Limitação: se o eco chegar antes de `gravarMensagemDoAssistente` terminar, ele seria tratado como mensagem do corretor.
- Opt-out é definitivo: `registrarOptOut` deixa `desligado` + `optOut`; `devolver`/`ligar` não religam; `atenderMensagem` sai cedo. Todo envio ao cliente passa por `enviarTextoAoCliente`/`enviarMidiaAoCliente` (`src/data/assistente/contexto.ts`), que lançam `OptOutError` com opt-out, exceto uma despedida liberada pela ferramenta `registrar_opt_out` na mesma rodada. Tickets seguintes (follow-up etc.) devem enviar por esses helpers.
- Worker: até o agendador do ticket 13, `src/worker/index.ts` chama `retomarAssistentesPausados()` a cada minuto.
- Interface: no detalhe do negócio, chip com o estado e botões "Devolver ao assistente", "Ligar/Desligar assistente" (`assistenteDaConversaAction`); com opt-out só um aviso, sem botões.
