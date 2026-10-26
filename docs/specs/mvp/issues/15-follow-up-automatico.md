# 15: Follow-up automático

**What to build:** O worker faz follow-up com clientes que pararam de responder durante o atendimento: 1, 3 e 7 dias após a última mensagem do cliente e depois a cada 2 semanas, até 90 dias de silêncio, quando o negócio vira "silencioso" (aberto, sem envios) e aparece num filtro no funil. Cada follow-up é escrito pelo assistente a partir da conversa. Envios só entre 8h e 20h, de segunda a sábado. Conversas pausadas pelo corretor não recebem follow-up; o corretor recebe lembrete. Nenhum negócio vai para Perdido automaticamente.

**Blocked by:** 10 (Corretor assume a conversa, pausa e opt-out), 13 (Visitas com disponibilidade do CRM)

**Status:** done

- [x] Cadência 1d / 3d / 7d / a cada 2 semanas, contada da última mensagem do cliente (teste com `setSystemTime`)
- [x] Resposta do cliente reinicia a contagem
- [x] Após 90 dias sem resposta, envios param e o negócio aparece no filtro de silenciosos
- [x] Nada é enviado fora de 8h–20h ou aos domingos; o envio vai para a próxima janela
- [x] Conversa pausada não recebe follow-up e o corretor é lembrado
- [x] Opt-out e conversas desligadas nunca recebem follow-up
- [x] O conteúdo do follow-up é gerado com o contexto da conversa (falso em testes)
- [x] Cada follow-up sai uma única vez, mesmo se o job rodar de novo

## Comments

- Cadência pura em `src/data/cadencia.ts` (`proximaJanelaDeEnvio`, `agendaDoFollowUp`, `followUpDevido`, `estaSilencioso`): passos em +1, +3, +7, +21, +35, +49, +63 e +77 dias da última mensagem do cliente (+91 passaria de 90), cada um deslocado para a próxima janela 8h–20h seg–sáb. A janela reaproveita `dentroDaJanelaDeAvisos` (exposta como `naJanelaDeEnvio`) para os lembretes dos tickets 16/18.
- Vários passos vencidos de uma vez (worker parado, negócios antigos no deploy) mandam só o mais recente: nada de rajada.
- Tabela `follow_ups` com chave natural (negócio, última mensagem do cliente, sequência): o passo é reivindicado antes do envio; falha do modelo ou do WhatsApp libera o passo para a próxima rodada. Nova mensagem do cliente muda a chave e a contagem recomeça.
- Só recebem follow-up conversas cujo negócio aberto mais recente está em Em atendimento ou Visita agendada. Novo fica de fora (o assistente ainda não conversou); das etapas finais em diante os lembretes são dos tickets 16/18.
- Conversa pausada: o passo vai ao corretor pelo número de sistema (um lembrete por passo); corretor sem telefone não consome o passo. Desligado/opt-out: nada.
- O texto vem de `llm.responder` com o histórico da conversa (`montarHistorico`, agora exportado de `assistente.ts`), instruções próprias de follow-up e sem ferramentas; sai por `enviarTextoAoCliente` (respeita opt-out) e fica gravado como mensagem do assistente.
- "Silencioso" é derivado (aberto + última mensagem do cliente há 90 dias ou mais): `listarNegociosSilenciosos(session)` e o chip "Silenciosos" no funil (`/painel?filtro=silenciosos`). Nenhuma etapa muda.
- Não conferido no navegador (rodando sem supervisão); typecheck, lint, testes e build passam.
