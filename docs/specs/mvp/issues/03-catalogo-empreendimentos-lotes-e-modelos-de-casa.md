# 03: Catálogo: empreendimentos, lotes e modelos de casa

**What to build:** Um corretor cadastra incorporadoras e empreendimentos (nome, cidade, endereço/localização, incorporadora), lotes (quadra, número, área, frente, fundo, preço) e modelos de casa (área construída, quartos, banheiros, suítes, vagas, preço). O status do lote (disponível, reservado, vendido) é visível e editável, e todo o catálogo é compartilhado entre os corretores da imobiliária.

**Blocked by:** 02 (Login e página de administração)

**Status:** done

- [x] Corretor cria, edita e lista incorporadoras, empreendimentos, lotes e modelos de casa
- [x] Quadra + número é único por empreendimento
- [x] Status de lote alterado por um corretor aparece para outro corretor da mesma imobiliária
- [x] Nenhum dado de catálogo de outra imobiliária é visível
- [x] Testes cobrem escopo por imobiliária
- [x] Criar é idempotente: reenviar o formulário não duplica

## Comments

**2026-10-23 (aprendizados do 02):** importação por planilha saiu do MVP (lotes são cadastrados um a um). As telas do catálogo seguem `docs/agents/conventions.md` (MUI, mobile-first, `id` gerado pelo servidor nos formulários de criação).

**2026-10-23 (implementação):** tabelas `incorporadoras` e `empreendimentos` (com `imobiliaria_id`), `lotes` e `modelos_de_casa` (escopadas pela imobiliária via join com o empreendimento; unique `empreendimento_id + quadra + numero`). DAL em `src/data/{incorporadoras,empreendimentos,lotes,modelos-de-casa}.ts`; `requireCorretor` novo em `session.ts` (administrador não mexe no catálogo) e `isUniqueViolation` em `src/data/errors.ts`. Status do lote é `disponivel | reservado | vendido` (`statusDeLote` no schema); `alterarStatusDoLote` leva ao status pedido e repetir não altera. Lote duplicado (criar ou editar) lança `LoteDuplicadoError`. Medidas e preços são `numeric` com `mode: "number"`. Interface em `/painel/catalogo` (layout próprio com AppBar e voltar) e uma página de edição por entidade; o mesmo formulário cria (id gerado no servidor) e edita (recebe `action` e `valores`). Fixtures novas: `sessaoDe`, `criarBruno`, `criarConcorrente`, `criarEmpreendimentoDaAna`, `ok`. Base de conhecimento, planos e material ficam para os tickets 04 e 05 referenciando `empreendimentos.id`. Conferido no navegador a 390px: Ana cadastra e reserva, Bruno vê o lote reservado, Carla (outra imobiliária) não vê nada.
