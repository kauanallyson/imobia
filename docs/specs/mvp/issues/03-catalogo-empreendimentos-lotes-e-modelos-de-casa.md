# 03: Catálogo: empreendimentos, lotes e modelos de casa

**What to build:** Um corretor cadastra incorporadoras e empreendimentos (nome, cidade, endereço/localização, incorporadora), lotes (quadra, número, área, frente, fundo, preço) e modelos de casa (área construída, quartos, banheiros, suítes, vagas, preço). Lotes também podem ser importados de uma planilha, criando ou atualizando por quadra + número. O status do lote (disponível, reservado, vendido) é visível e editável, e todo o catálogo é compartilhado entre os corretores da imobiliária.

**Blocked by:** 02 (Login e página de administração)

**Status:** ready-for-agent

- [ ] Corretor cria, edita e lista incorporadoras, empreendimentos, lotes e modelos de casa
- [ ] Importação de planilha cria lotes novos e atualiza existentes por quadra + número, com relatório de linhas inválidas
- [ ] Status de lote alterado por um corretor aparece para outro corretor da mesma imobiliária
- [ ] Nenhum dado de catálogo de outra imobiliária é visível
- [ ] Testes cobrem importação e escopo por imobiliária
- [ ] Criar é idempotente: reenviar o formulário não duplica; reimportar a mesma planilha não muda nada

## Comments

**2026-10-23 (aprendizados do 02):** a biblioteca para ler a planilha (CSV/XLSX) ainda não foi escolhida; decida com o usuário antes de instalar. As telas do catálogo seguem `docs/agents/conventions.md` (MUI, mobile-first, `id` gerado pelo servidor nos formulários de criação).
