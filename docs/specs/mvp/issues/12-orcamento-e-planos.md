# 12: Orçamento e planos

**What to build:** O assistente pergunta quanto o cliente pode dar de entrada e qual o máximo de parcela, e oferece **somente** planos e lotes cujo cálculo cabe nesse orçamento. O cliente confirma ou reformula. Quando nada cabe, o assistente oferece a combinação disponível de menor valor total e marca o negócio como fora do orçamento, sem descartá-lo. O assistente nunca informa valores que não venham do cálculo do sistema e não negocia desconto (pedido de desconto vira pendência).

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** ready-for-agent

- [ ] Orçamento informado fica registrado no negócio
- [ ] A ferramenta de filtro devolve só combinações plano + lote (ou lote + casa) dentro do orçamento
- [ ] Sem combinação possível: combinação disponível de menor valor total é oferecida e o negócio é marcado fora do orçamento
- [ ] Pedido de desconto cria pendência
- [ ] Testes cobrem o filtro por orçamento com lotes de preços variados
