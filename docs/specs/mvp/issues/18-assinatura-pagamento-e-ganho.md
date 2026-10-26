# 18: Assinatura, pagamento e Ganho

**What to build:** O cliente devolve a proposta assinada no gov.br pelo WhatsApp; o PDF é anexado à proposta e gera a pendência de confirmar assinatura. A confirmação move o negócio para Aguardando pagamento e o assistente envia as instruções de pagamento da entrada configuradas pelo corretor para a incorporadora. O cliente envia o comprovante, que gera a pendência de confirmar pagamento; a confirmação move o negócio para Ganho e o lote para vendido. Lembretes a cada 2 dias nessas etapas, até a expiração da reserva quando houver.

**Blocked by:** 15 (Follow-up automático), 17 (Proposta e reserva)

**Status:** done

- [x] PDF recebido do cliente nessa etapa é anexado à proposta e cria pendência de confirmação de assinatura
- [x] Confirmação da assinatura move para Aguardando pagamento e envia os dados de pagamento da entrada
- [x] Comprovante recebido cria pendência de confirmação de pagamento
- [x] Confirmação do pagamento move para Ganho, marca o lote como vendido e encerra a reserva
- [x] Lembretes nessas etapas seguem a cadência e a janela de horário
- [x] O sistema não processa pagamento
- [x] Corretor configura instruções reutilizáveis de pagamento por incorporadora, usadas ao enviar os dados da entrada
- [x] Confirmar assinatura ou pagamento de novo não altera nada

## Comments

- DAL em `src/data/assinatura-e-pagamento.ts`. Proposta assinada e comprovantes ficam em `arquivos_do_fechamento` (privados no R2, chave natural = mensagem de origem, `aceito` = decisão do corretor); `propostas.chave_pdf_assinado` aponta para o PDF assinado em análise. A escolha da mídia segue `registrarDocumentoRecebido`: mídias do cliente desde a entrada na etapa, a mais antiga ainda não registrada (ignorando documentos da coleta e o arquivo já registrado como o outro tipo); proposta assinada aceita só PDF.
- `confirmarAssinatura` exige instruções de pagamento na incorporadora (`SemInstrucoesDePagamentoError`) e envia pelo helper com opt-out; falha no envio desfaz a confirmação. Valor da entrada vem de `calcularPlanoParaLote` com lote/plano/casa da proposta. `rejeitarAssinatura` limpa o PDF assinado, resolve a pendência e pede reenvio pelo gov.br.
- `confirmarPagamento` numa transação: negócio → Ganho (histórico autor corretor), lote → vendido, reserva → `concluida` (novo estado; o job de expiração só olha `ativa`), comprovantes aceitos, pendência resolvida. Se a reserva já tinha expirado e o lote segue livre, a venda é confirmada; lote vendido ou reservado para outra proposta → `LoteIndisponivelError`.
- Lembretes (`jobDeLembretesDeEtapasFinais`, tabela `lembretes_de_etapas_finais`, negócio + data): a cada 2 dias desde a entrada na etapa, 8h–20h seg–sáb, só conversa ativa sem opt-out; param quando a reserva expira; não lembram quem já mandou o PDF ou comprovante e espera o corretor.
- A expiração da reserva continua liberando o lote mesmo com a proposta assinada (comportamento do ticket 17, coerente com "lembretes até a expiração da reserva"); o corretor pode prorrogar.
- LGPD: `apagarDadosDoCliente` também apaga do R2 a proposta assinada e os comprovantes.

