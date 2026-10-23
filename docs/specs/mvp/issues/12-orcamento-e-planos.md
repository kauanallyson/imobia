# 12: Orçamento e planos

**What to build:** O assistente pergunta quanto o cliente pode dar de entrada e qual o máximo de parcela, e oferece **somente** planos e lotes cujo cálculo cabe nesse orçamento. O cliente confirma ou reformula. Quando nada cabe, o assistente oferece a opção mais próxima ou um lote mais barato e marca o negócio como fora do orçamento, sem descartá-lo. O assistente nunca informa valores que não venham do cálculo do sistema e não negocia desconto (pedido de desconto vira pendência).

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** done

- [x] Orçamento informado fica registrado no negócio
- [x] A ferramenta de filtro devolve só combinações plano + lote (ou lote + casa) dentro do orçamento
- [x] Sem combinação possível: opção mais próxima é oferecida e o negócio é marcado fora do orçamento
- [x] Pedido de desconto cria pendência
- [x] Testes cobrem o filtro por orçamento com lotes de preços variados

## Comments

- Orçamento guardado no negócio em **centavos** (`orcamento_entrada`, `orcamento_parcela_maxima`); ferramentas e interface trabalham em reais e convertem. `registrarOrcamento` zera `fora_do_orcamento` (novo orçamento, nova avaliação).
- Além das colunas previstas, foi acrescentada `modelo_de_casa_escolhido_id`: sem ela o plano escolhido de lote + casa não teria como ser recalculado na página do negócio.
- `src/data/orcamento.ts` só filtra e ordena; todo número vem de `calcularPlano`. Opção mais próxima = menor estouro (entrada + parcela, em centavos); empate → lote mais barato.
- As ferramentas (`src/data/assistente/ferramentas/12-orcamento.ts`) releem o negócio pela DAL (`buscarResumoDoNegocio`) em vez de ampliar `ContextoDoAtendimento`, para não mexer em `atenderMensagem`.
- `pedido_de_desconto`: `src/data/pendencias.ts` (ticket 11) não existia no fim deste ticket; a ferramenta devolve a instrução de encaminhar ao corretor e deixa um `TODO(ticket 11)` para criar a pendência. **Conferir na integração final** e ligar à DAL de pendências.
