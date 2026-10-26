# 16: Coleta de dados do cliente

**What to build:** Quando o cliente decide fechar, o negócio vai para Coletando dados e o assistente coleta: fotos de CPF, RG e comprovante de endereço (guardadas privadas no R2, com verificação de presença e legibilidade; a IA sinaliza possível ilegibilidade e pede reenvio, mas o corretor decide se aceita), dois contatos de referência, e-mail e outros contatos, forma de pagamento pretendida (cartão ou Pix), melhor dia do mês para pagamento (primeira parcela em até 90 dias) e a escolha de um lote disponível. O corretor vê documentos por URL assinada e pode apagar dados identificáveis e arquivos do cliente a pedido, mantendo registros de negócio e proposta anonimizados. Lembretes a cada 2 dias enquanto faltar algo.

**Blocked by:** 12 (Orçamento e planos)

**Status:** done

- [x] Negócio vai para Coletando dados quando o cliente decide fechar
- [x] Cada documento recebido é registrado; IA sinaliza possível ilegibilidade e pede reenvio; corretor pode aceitar ou rejeitar o documento
- [x] Referências, contatos, forma e dia de pagamento ficam no cliente
- [x] Escolha de lote só aceita lotes disponíveis
- [x] Documentos são privados e acessados por URL assinada de curta duração
- [x] Corretor apaga dados pessoais identificáveis e arquivos; negócios e propostas permanecem anonimizados
- [x] Lembretes de itens faltantes respeitam a cadência e a janela de horário
- [x] Lembretes de itens faltantes não duplicam se o job rodar de novo

## Comments

- Dados em `clientes` (bloco "ticket 16"): `contatos_extras` e `referencias` em jsonb (máx. 2; mesmo telefone atualiza o nome), `forma_de_pagamento`, `dia_de_pagamento` (CHECK 1–28), `primeira_parcela` (próxima ocorrência do dia, ou data pedida; precisa cair em até 90 dias, senão `PrimeiraParcelaForaDoPrazoError`) e `anonimizado_em`.
- `documentos_do_cliente`: chave privada `imobiliarias/<id>/clientes/<id>/documentos/<uuid>`, `legivel`/`motivo` da IA (null = não avaliado), `aceito` do corretor (null = pendente), `mensagem_id` único (idempotência). `registrar_documento` pega a foto/arquivo mais antigo do cliente ainda sem documento desde a entrada em Coletando dados (o cliente pode mandar CPF e RG juntos); repetir devolve o último já registrado. Ilegível: a ferramenta devolve `instrucao` para o modelo pedir reenvio; o documento conta como faltando até o corretor aceitar.
- `status_da_coleta`/lembretes exigem: 3 documentos, e-mail, número do CPF, 2 referências, forma e dia de pagamento e lote. Documento conta se aceito, ou se ainda sem decisão e não sinalizado ilegível.
- `escolher_lote`: só `disponivel` do empreendimento do negócio (`LoteIndisponivelError`; a ferramenta devolve os disponíveis). Reserva fica para o ticket da proposta.
- LGPD (`apagarDadosDoCliente`): apaga os arquivos do R2 (antes do banco; repetir conclui), documentos e mensagens da conversa, desliga o assistente e anonimiza o cliente (nome "Cliente removido", telefone `removido-<id>` para manter a unique). Negócios e histórico ficam.
- Lembretes (`jobDeLembretesDeColeta`): a cada 2 dias contados da entrada na etapa / último lembrete, só 8h–20h seg–sáb, chave `lembretes_de_coleta (negocio, data)`, só com assistente ativo e sem opt-out.
- `iniciar_coleta` reaproveita `mudarEtapa` (como `fechar_agora` do ticket 13).
