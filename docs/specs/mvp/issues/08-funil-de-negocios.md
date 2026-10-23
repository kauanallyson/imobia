# 08: Funil de negócios

**What to build:** O corretor vê seus negócios num quadro por etapa no celular, abre um negócio e vê a conversa completa do WhatsApp, os dados do cliente, o lote de interesse e o histórico de etapas. Ele muda a etapa manualmente, marca Perdido com motivo, reabre negócios perdidos e cadastra cliente e negócio manualmente. Um cliente pode ter vários negócios. Só os próprios negócios do corretor aparecem.

**Blocked by:** 06 (Conectar WhatsApp)

**Status:** done

- [x] Quadro mostra os negócios do corretor agrupados pelas etapas fixas
- [x] Detalhe do negócio mostra conversa, dados do cliente, lote de interesse e histórico de etapas
- [x] Mudança manual de etapa fica no histórico
- [x] Perdido exige motivo; negócio perdido pode ser reaberto
- [x] Cadastro manual de cliente e negócio funciona; um cliente pode ter mais de um negócio
- [x] Corretor não vê negócios de outro corretor (teste dedicado)
- [x] Mudar para a etapa em que o negócio já está não gera entrada nova no histórico

## Comments

**2026-10-23 (aprendizados do 02):** o quadro substitui o painel vazio de `src/app/painel/page.tsx`; mantenha a checagem `verificarCorretor` no componente que envolve a página inteira.

**2026-10-23 (implementação):** DAL em `src/data/negocios.ts` (`listarNegociosPorEtapa`, `buscarNegocio`, `mudarEtapa`, `marcarPerdido`, `reabrir`, `criarNegocio`) e `src/data/clientes.ts` (`criarCliente`, `buscarCliente`, `normalizarTelefone`). Toda mudança de etapa é "levar à etapa X" numa transação com `for update`: repetir não cria linha no histórico. `negocio_etapas.autor` (`corretor | assistente | sistema`) diz quem moveu; a criação pela mensagem de número novo é `sistema`, a manual é `corretor`. Perdido só por `marcarPerdido` (motivo obrigatório; `mudarEtapa("perdido")` lança `EtapaInvalidaError`); repetir mantém o motivo original. `reabrir` volta ao `de` da última entrada para Perdido (ou Novo). `negocios.lote_interesse_id` é nullable com FK para `lotes.id` (ticket 03 já mesclado); o detalhe mostra quadra, número, empreendimento e status do lote. `requireCorretor` passou a ser o único de `src/data/session.ts` (clientes, conversas e negócios o importam de lá). UI: quadro em `/painel` (uma coluna, seção por etapa), detalhe em `/painel/negocios/[id]`, cadastro manual em `/painel/negocios/novo` e "Novo negócio para este cliente" no detalhe. Conferido no navegador a 390px com Playwright.
