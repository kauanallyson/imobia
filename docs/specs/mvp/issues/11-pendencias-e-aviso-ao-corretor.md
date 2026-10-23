# 11: Pendências e aviso ao corretor

**What to build:** O assistente cria pendências quando não encontra a resposta na base de conhecimento ou quando o cliente pede uma pessoa (nesse caso também pausa a conversa). O corretor vê a lista de pendências no CRM e resolve cada uma pelo celular. Para cada pendência, um número de sistema (instância Evolution própria) manda ao corretor uma mensagem no WhatsApp com link, respeitando 8h–20h exceto para "cliente pediu pessoa" e "revisar proposta".

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** done

- [x] Pergunta sem resposta na base cria pendência e o assistente avisa o cliente que vai verificar
- [x] Pedido de falar com uma pessoa cria pendência urgente e pausa o assistente
- [x] Lista de pendências no CRM, com resolução pelo celular
- [x] Aviso no WhatsApp do corretor via número de sistema, com link para a pendência
- [x] Avisos de "cliente pediu pessoa" e "revisar proposta" podem sair fora de 8h–20h; os demais esperam a próxima janela (teste com `setSystemTime`)
- [x] Resolver uma pendência já resolvida não muda nada; cada pendência gera um único aviso

## Comments

- Tabela `pendencias` (corretor, negócio, tipo, descrição, estado, `criada_em`, `resolvida_em`, `aviso_enviado_em`). Chave natural = negócio + tipo + descrição **aberta** (unique parcial): repetir devolve a existente; resolvida, a mesma pergunta pode virar pendência nova. DAL em `src/data/pendencias.ts` (`criarPendencia`, `listarPendencias`, `buscarPendencia`, `resolverPendencia`, `avisarCorretor`, `enviarAvisosPendentes`), tudo escopado pelo corretor.
- Ferramentas em `src/data/assistente/ferramentas/11-pendencias.ts`: `criar_pendencia_pergunta_sem_resposta(pergunta)` (o modelo decide a relevância dos trechos devolvidos pela busca; a seção do prompt manda avisar o cliente que vai verificar) e `chamar_corretor(motivo)` (pendência urgente + conversa em `pausado`; a despedida daquela rodada ainda sai). A pausa por mensagem `fromMe` fica no ticket 10.
- Aviso pelo número de sistema: `enviarTextoDoSistema` em `src/lib/whatsapp.ts` usa `EVOLUTION_SYSTEM_INSTANCE` (opcional no env: sem ela o envio falha, o erro vai para o log e a pendência fica para o job). O aviso é reivindicado (`aviso_enviado_em`) antes do envio, por isso cada pendência gera um só; falha no envio libera para o job. Urgentes (`cliente_pediu_pessoa`, `revisar_proposta`) saem a qualquer hora; os demais só 8h–20h seg–sáb (America/Sao_Paulo); fora disso `enviarAvisosPendentes()` (chamado pelo worker a cada minuto; ticket 13 move para o registro de jobs) envia na janela.
- `users.telefone` (nulo = corretor sem aviso) com campo no cadastro e formulário inline por corretor em `/admin/imobiliarias/[id]`; `userColumns` passou a expor `telefone`.
- Interface: `/painel/pendencias` (abertas primeiro, chip do tipo) e `/painel/pendencias/[id]` (Resolver + link para o negócio); link "Pendências" na AppBar do painel. Conferido em 390px com Playwright.
