# 03: Catálogo: empreendimentos, lotes e modelos de casa

**What to build:** Um corretor cadastra incorporadoras e empreendimentos (nome, cidade, endereço/localização, incorporadora), lotes (quadra, número, área, frente, fundo, preço) e modelos de casa (área construída, quartos, banheiros, suítes, vagas, preço). O status do lote (disponível, reservado, vendido) é visível e editável, e todo o catálogo é compartilhado entre os corretores da imobiliária.

**Blocked by:** 02 (Login e página de administração)

**Status:** ready-for-agent

- [ ] Corretor cria, edita e lista incorporadoras, empreendimentos, lotes e modelos de casa
- [ ] Quadra + número é único por empreendimento
- [ ] Status de lote alterado por um corretor aparece para outro corretor da mesma imobiliária
- [ ] Nenhum dado de catálogo de outra imobiliária é visível
- [ ] Testes cobrem escopo por imobiliária
- [ ] Criar é idempotente: reenviar o formulário não duplica

## Comments

**2026-10-23 (aprendizados do 02):** importação por planilha saiu do MVP (lotes são cadastrados um a um). As telas do catálogo seguem `docs/agents/conventions.md` (MUI, mobile-first, `id` gerado pelo servidor nos formulários de criação).
