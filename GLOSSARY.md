# CRM Imobiliário

CRM para imobiliárias e corretores que vendem lotes de empreendimentos de incorporadoras, com um atendente de IA no WhatsApp que conduz o cliente do primeiro contato até a proposta.

## Linguagem

### Organização

**Imobiliária**:
A empresa que usa o sistema; todos os dados pertencem a exatamente uma imobiliária. Um corretor autônomo é uma imobiliária com um único membro.
_Evitar_: Empresa, conta, tenant, organização

**Corretor**:
Uma pessoa da imobiliária que atende clientes e conduz vendas.
_Evitar_: Vendedor, agente, usuário, consultor

**Assistente**:
A IA de um corretor, que atende os clientes no WhatsApp desse corretor em nome dele; cada corretor tem exatamente um assistente.
_Evitar_: Agente, bot, atendente IA, IA, chatbot

**Administrador**:
O dono do sistema, que cria imobiliárias e corretores; não pertence a nenhuma imobiliária.
_Evitar_: Admin, superusuário, gestor

**Incorporadora**:
A empresa dona do empreendimento, para quem a imobiliária vende e a quem a venda fechada é encaminhada.
_Evitar_: Construtora, loteadora, parceira

### Catálogo

**Empreendimento**:
Um loteamento de uma incorporadora, cujos lotes a imobiliária vende.
_Evitar_: Loteamento, condomínio, projeto, imóvel

**Lote**:
Uma unidade de terreno de um empreendimento, identificada por quadra e número, que está disponível, reservada ou vendida.
_Evitar_: Terreno, unidade, imóvel

**Modelo de casa**:
Uma casa padrão oferecida para construção sobre um lote de um empreendimento; "lote + casa" é um lote somado a um modelo de casa.
_Evitar_: Planta, casa, projeto

**Plano de pagamento**:
Uma condição de pagamento cadastrada para um empreendimento (entrada, parcelas e taxas); o atendente de IA só oferece planos cadastrados.
_Evitar_: Condição, financiamento, tabela

**Material de marketing**:
Os arquivos de um empreendimento que o assistente envia ao cliente, marcados para lote, lote + casa ou ambos.
_Evitar_: Mídia, anexos, folder

**Base de conhecimento**:
O texto descritivo de um empreendimento (localização, infraestrutura, perguntas frequentes) que o assistente consulta para responder clientes.
_Evitar_: FAQ, documentação, contexto

### Venda

**Cliente**:
A pessoa que compra ou pode comprar um lote, com seus dados de contato, documentos e referências.
_Evitar_: Lead, contato, comprador, prospect

**Negócio**:
Uma tentativa de vender um lote (ou lote + casa) a um cliente, que avança pelas etapas até ganho ou perdido; um cliente pode ter vários negócios.
_Evitar_: Lead, oportunidade, venda, deal

**Etapa**:
A posição fixa de um negócio no funil: Novo, Em atendimento, Visita agendada, Coletando dados, Proposta em revisão, Aguardando assinatura, Aguardando pagamento, Ganho ou Perdido.
_Evitar_: Status, fase, estágio

**Proposta**:
O documento que formaliza a compra de um lote (ou lote + casa) por um plano de pagamento, revisado por um corretor antes de ser enviado ao cliente para assinatura no gov.br.
_Evitar_: Contrato, orçamento, pedido

**Reserva**:
O bloqueio de um lote enquanto sua proposta enviada aguarda assinatura; expira e libera o lote se a proposta não for assinada a tempo.
_Evitar_: Bloqueio, pré-venda

**Visita**:
Um encontro agendado entre corretor e cliente, por padrão no empreendimento, registrado na agenda do corretor.
_Evitar_: Agendamento, reunião, compromisso

**Pendência**:
Algo que o assistente não pode resolver sozinho e aguarda o corretor: revisar uma proposta, responder uma pergunta fora da base de conhecimento ou atender um cliente que pediu uma pessoa.
_Evitar_: Tarefa, alerta, notificação, ticket
