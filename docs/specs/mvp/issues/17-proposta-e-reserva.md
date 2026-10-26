# 17: Proposta e reserva

**What to build:** O corretor envia por incorporadora um modelo DOCX com placeholders nomeados. Com os dados completos, o sistema substitui os campos (cliente, lote, modelo de casa, plano, data de pagamento), gera o PDF, move o negócio para Proposta em revisão e cria a pendência de revisão. O corretor aprova e o PDF vai ao cliente com instruções para assinar no gov.br; o negócio vai para Aguardando assinatura e o lote fica reservado por 72h. A reserva é prorrogável e, ao expirar, libera o lote. O banco garante que um lote tenha no máximo uma reserva ativa, e lotes reservados ou vendidos não entram em nova proposta.

**Blocked by:** 11 (Pendências e aviso ao corretor), 16 (Coleta de dados do cliente)

**Status:** done

- [x] Corretor envia um modelo DOCX por incorporadora com placeholders nomeados; o PDF gerado contém os campos substituídos corretamente
- [x] Proposta gerada com os dados corretos, pendência de revisão criada e negócio em Proposta em revisão
- [x] Aprovação envia o PDF com instruções do gov.br, cria a reserva de 72h e move para Aguardando assinatura
- [x] Duas propostas concorrentes para o mesmo lote: só uma reserva vence (teste de concorrência)
- [x] Lote reservado ou vendido não pode entrar em nova proposta
- [x] Reserva prorrogada manualmente estende a expiração; reserva expirada libera o lote (teste com `setSystemTime`)
- [x] Aprovar duas vezes envia a proposta e cria a reserva uma única vez

## Comments

- **Modelo**: tabela `modelos_de_proposta` (um DOCX por incorporadora, privado no R2; enviar outro substitui e apaga o antigo). Os placeholders aceitos ficam em `camposDaProposta` (`src/data/propostas.ts`) e aparecem na página da incorporadora, que também avisa campos desconhecidos (ficam como estão no PDF).
- **DOCX → PDF**: `src/lib/documentos.ts` (fflate + XML; junta o texto dos runs de cada parágrafo, então placeholders quebrados pelo Word funcionam; corpo, cabeçalhos e rodapés) e `soffice --headless --convert-to pdf` com perfil temporário por conversão. LibreOffice Writer + fontes Liberation na imagem `app` (Containerfile, `docs/deploy.md`); `SOFFICE_PATH` opcional. A conversão real foi conferida num container `oven/bun:1.4.4-alpine`. O falso (`src/test/fakes/documentos.ts`) reaproveita o preenchimento real e só falsifica o PDF. `src/lib/storage.ts` ganhou `lerArquivo`.
- **Proposta**: uma viva por negócio (unique parcial `estado <> 'expirada'`); `gerarProposta` exige coleta completa + plano escolhido, recusa lote reservado/vendido e incorporadora sem modelo, gera o PDF dentro da transação do insert (geração simultânea espera e relê), leva a Proposta em revisão e cria a pendência urgente `revisar_proposta`. Depois de expirada, o negócio pode gerar outra.
- **Aprovação**: numa transação com proposta e lote trancados (`for update`): insere a reserva (72h), lote → reservado, proposta → enviada e envia o PDF (URL assinada de 1h) + instruções do gov.br pelos helpers com opt-out. Falha no envio (opt-out, Evolution) desfaz tudo. Sem conversa/WhatsApp → `SemWhatsappError`. Depois: grava as mensagens como do assistente, leva a Aguardando assinatura e resolve a pendência de revisão. Unique parcial `reservas_lote_ativa` é a garantia final.
- **Reserva**: estados `ativa | expirada` (ticket 18 decide o que acontece na assinatura). `prorrogarReserva` aceita `{ horas }` ou `{ expiraEm }`; a interface manda a expiração absoluta calculada na renderização (+24h/+72h), então reenviar não soma de novo. Job `expiracao-de-reservas` em `src/worker/jobs.ts`.
- **Fora do escopo / dívida**: o PDF da proposta não é apagado na exclusão LGPD (spec: proposta fica para histórico; o arquivo contém dados pessoais — revisar com o ticket 18). Remover um plano usado por proposta falha pela FK.
