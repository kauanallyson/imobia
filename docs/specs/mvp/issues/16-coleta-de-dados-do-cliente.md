# 16: Coleta de dados do cliente

**What to build:** Quando o cliente decide fechar, o negócio vai para Coletando dados e o assistente coleta: fotos de CPF, RG e comprovante de endereço (guardadas privadas no R2, com verificação de presença e legibilidade e novo pedido se ilegível), dois contatos de referência, e-mail e outros contatos, forma de pagamento pretendida (cartão ou Pix), melhor dia do mês para pagamento (primeira parcela em até 90 dias) e a escolha de um lote disponível. O corretor vê documentos por URL assinada e pode apagar dados e documentos do cliente a pedido (LGPD). Lembretes a cada 2 dias enquanto faltar algo.

**Blocked by:** 12 (Orçamento e planos)

**Status:** ready-for-agent

- [ ] Negócio vai para Coletando dados quando o cliente decide fechar
- [ ] Cada documento recebido é registrado; ilegível gera novo pedido
- [ ] Referências, contatos, forma e dia de pagamento ficam no cliente
- [ ] Escolha de lote só aceita lotes disponíveis
- [ ] Documentos são privados e acessados por URL assinada de curta duração
- [ ] Corretor apaga dados e documentos do cliente
- [ ] Lembretes de itens faltantes respeitam a cadência e a janela de horário
- [ ] Lembretes de itens faltantes não duplicam se o job rodar de novo
