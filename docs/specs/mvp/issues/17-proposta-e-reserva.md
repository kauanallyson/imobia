# 17: Proposta e reserva

**What to build:** O corretor envia por incorporadora um modelo DOCX com placeholders nomeados. Com os dados completos, o sistema substitui os campos (cliente, lote, modelo de casa, plano, data de pagamento), gera o PDF, move o negócio para Proposta em revisão e cria a pendência de revisão. O corretor aprova e o PDF vai ao cliente com instruções para assinar no gov.br; o negócio vai para Aguardando assinatura e o lote fica reservado por 72h. A reserva é prorrogável e, ao expirar, libera o lote. O banco garante que um lote tenha no máximo uma reserva ativa, e lotes reservados ou vendidos não entram em nova proposta.

**Blocked by:** 11 (Pendências e aviso ao corretor), 16 (Coleta de dados do cliente)

**Status:** ready-for-agent

- [ ] Corretor envia um modelo DOCX por incorporadora com placeholders nomeados; o PDF gerado contém os campos substituídos corretamente
- [ ] Proposta gerada com os dados corretos, pendência de revisão criada e negócio em Proposta em revisão
- [ ] Aprovação envia o PDF com instruções do gov.br, cria a reserva de 72h e move para Aguardando assinatura
- [ ] Duas propostas concorrentes para o mesmo lote: só uma reserva vence (teste de concorrência)
- [ ] Lote reservado ou vendido não pode entrar em nova proposta
- [ ] Reserva prorrogada manualmente estende a expiração; reserva expirada libera o lote (teste com `setSystemTime`)
- [ ] Aprovar duas vezes envia a proposta e cria a reserva uma única vez
