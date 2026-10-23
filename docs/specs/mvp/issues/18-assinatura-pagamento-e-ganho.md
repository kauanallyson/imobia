# 18: Assinatura, pagamento e Ganho

**What to build:** O cliente devolve a proposta assinada no gov.br pelo WhatsApp; o PDF é anexado à proposta e gera a pendência de confirmar assinatura. A confirmação move o negócio para Aguardando pagamento e o assistente envia os dados para pagar a entrada. O cliente envia o comprovante, que gera a pendência de confirmar pagamento; a confirmação move o negócio para Ganho e o lote para vendido. Lembretes a cada 2 dias nessas etapas, até a expiração da reserva quando houver.

**Blocked by:** 15 (Follow-up automático), 17 (Proposta e reserva)

**Status:** ready-for-agent

- [ ] PDF recebido do cliente nessa etapa é anexado à proposta e cria pendência de confirmação de assinatura
- [ ] Confirmação da assinatura move para Aguardando pagamento e envia os dados de pagamento da entrada
- [ ] Comprovante recebido cria pendência de confirmação de pagamento
- [ ] Confirmação do pagamento move para Ganho, marca o lote como vendido e encerra a reserva
- [ ] Lembretes nessas etapas seguem a cadência e a janela de horário
- [ ] O sistema não processa pagamento
