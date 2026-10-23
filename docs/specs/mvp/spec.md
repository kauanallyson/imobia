# Spec: MVP do CRM imobiliário com assistente no WhatsApp

**Status:** ready-for-agent

Vocabulário: ver `GLOSSARY.md`. Decisões arquiteturais: ver `docs/adr/` (0001 imobiliária desde o dia um, 0003 domínio em pt-BR, 0004 WhatsApp via Evolution API).

## Problem Statement

Corretores que vendem lotes de empreendimentos recebem clientes pelo WhatsApp a qualquer hora, vindos de anúncios. Cada atendimento repete o mesmo roteiro: mandar o material certo, explicar os planos de pagamento, ver se cabe no orçamento, marcar visita, juntar documentos e referências, montar a proposta, acompanhar assinatura e pagamento. Feito à mão, o corretor demora para responder, perde clientes que param de responder porque ninguém faz o acompanhamento, esquece em que ponto cada cliente está e corre o risco de oferecer o mesmo lote a dois clientes.

## Solution

Cada corretor tem um **assistente**: uma IA ligada ao WhatsApp do próprio corretor que atende clientes novos 24/7 em nome dele. O assistente conduz o cliente pelo roteiro de venda: apresenta o empreendimento, envia o material de marketing, oferece apenas os planos de pagamento cadastrados que cabem no orçamento, agenda visitas na agenda do corretor, coleta documentos e dados e prepara a proposta. O corretor revisa e aprova a proposta, acompanha tudo num funil de negócios pelo celular, pode assumir qualquer conversa respondendo direto do WhatsApp (o assistente pausa) e é avisado no WhatsApp quando algo precisa dele. O assistente faz follow-up com clientes que param de responder para que nenhum se perca por silêncio. O catálogo de empreendimentos, lotes e modelos de casa é compartilhado pela imobiliária, e a reserva de lotes impede que dois clientes recebam proposta do mesmo lote.

## User Stories

### Administrador e acesso

1. Como administrador, quero uma página de administração que só eu acesso, para cadastrar imobiliárias sem expor isso a corretores.
2. Como administrador, quero criar uma imobiliária, para que seus corretores e dados fiquem agrupados nela.
3. Como administrador, quero criar corretores com e-mail e senha dentro de uma imobiliária, para que eles possam entrar no sistema.
4. Como administrador, quero desativar um corretor, para que ele não acesse mais o sistema.
5. Como corretor, quero entrar com e-mail e senha, para acessar meus clientes e negócios.
6. Como corretor, quero que o sistema funcione bem no celular, para trabalhar de onde estiver.
7. Como corretor, quero ver apenas meus próprios clientes, negócios e conversas, para que minha carteira seja privada.

### Catálogo

8. Como corretor, quero cadastrar incorporadoras, para associar empreendimentos a quem os desenvolve.
9. Como corretor, quero cadastrar um empreendimento com nome, cidade, endereço e incorporadora, para que o assistente possa apresentá-lo.
10. Como corretor, quero cadastrar lotes com quadra, número, área, frente, fundo e preço, para que o assistente saiba o que está à venda.
11. Como corretor, quero importar lotes de uma planilha, para não cadastrar centenas de lotes um a um.
12. Como corretor, quero ver e alterar o status de cada lote (disponível, reservado, vendido), para manter o catálogo em dia com a incorporadora.
13. Como corretor, quero que o status dos lotes seja compartilhado por toda a imobiliária, para que dois corretores nunca vendam o mesmo lote.
14. Como corretor, quero cadastrar modelos de casa com área construída, quartos, banheiros, suítes, vagas e preço para um empreendimento, para oferecer lote + casa.
15. Como corretor, quero cadastrar planos de pagamento por empreendimento, para que o assistente só ofereça condições reais.
16. Como corretor, quero ver o valor de entrada e das parcelas calculado para um lote ou lote + casa num plano, para conferir o que o assistente vai informar.
17. Como corretor, quero enviar arquivos de material de marketing (PDF, imagem, vídeo) de um empreendimento, marcando cada um como de lote, lote + casa ou ambos, para que o assistente envie o material certo.
18. Como corretor, quero escrever a base de conhecimento de um empreendimento (localização, infraestrutura, perguntas frequentes), para que o assistente responda dúvidas com informação correta.
19. Como corretor, quero enviar o modelo de proposta de cada incorporadora, para que as propostas saiam no formato que ela exige.

### Conexão do WhatsApp

20. Como corretor, quero ler e aceitar um aviso de que a conexão não é oficial e que meu número pode ser banido, antes de conectar, para decidir conscientemente.
21. Como corretor, quero conectar meu WhatsApp lendo um QR code, para que o assistente atenda pelo meu número.
22. Como corretor, quero continuar usando o WhatsApp no meu celular normalmente depois de conectar, para não mudar minha rotina.
23. Como corretor, quero ver se meu WhatsApp está conectado ou desconectado, e reconectar quando cair, para não perder clientes sem perceber.
24. Como corretor, quero que o assistente responda apenas números que nunca falaram comigo, para que ele não fale com minha família, amigos ou clientes antigos.
25. Como corretor, quero que o assistente ignore grupos, para que ele nunca fale em grupos.
26. Como corretor, quero ligar ou desligar o assistente numa conversa específica, para controlar exceções.
27. Como corretor, quero que minhas conversas antigas não sejam importadas, para que o sistema não guarde dados pessoais desnecessários.

### Funil de negócios

28. Como corretor, quero que um cliente novo no WhatsApp vire automaticamente um cliente com um negócio na etapa Novo, para não precisar cadastrar ninguém.
29. Como corretor, quero cadastrar um cliente e um negócio manualmente, para registrar clientes que chegaram por outros meios.
30. Como corretor, quero ver meus negócios num quadro por etapa, para saber em que ponto cada cliente está.
31. Como corretor, quero abrir um negócio e ver a conversa completa do WhatsApp, os dados do cliente, o lote de interesse e o histórico de etapas, para entender a situação rapidamente.
32. Como corretor, quero mudar a etapa de um negócio manualmente, para corrigir ou adiantar o fluxo.
33. Como corretor, quero marcar um negócio como Perdido com um motivo, para registrar por que a venda não aconteceu.
34. Como corretor, quero reabrir um negócio perdido quando o cliente voltar, para não começar do zero.
35. Como corretor, quero que um cliente possa ter vários negócios, para registrar a compra de um segundo lote ou uma nova tentativa.

### Assistente: atendimento

36. Como cliente, quero receber resposta imediata a qualquer hora quando mando mensagem pelo anúncio, para não ficar esperando.
37. Como cliente, quero que o assistente se apresente como assistente virtual do corretor, para saber com quem estou falando.
38. Como cliente, quero que o assistente diga que é uma IA quando eu perguntar, para não ser enganado.
39. Como cliente, quero escolher entre lote e lote + casa, para receber o material de marketing que me interessa.
40. Como cliente, quero tirar dúvidas sobre o empreendimento e receber respostas corretas, para decidir com segurança.
41. Como corretor, quero que, quando o assistente não souber a resposta na base de conhecimento, ele diga que vai verificar e crie uma pendência para mim, em vez de inventar.
42. Como cliente, quero mandar áudio e ser entendido, porque é como costumo usar o WhatsApp.
43. Como corretor, quero ver a transcrição dos áudios do cliente na conversa, para não precisar ouvi-los.
44. Como cliente, quero pedir para falar com uma pessoa a qualquer momento, para ser atendido pelo corretor.
45. Como corretor, quero que o negócio vá para Em atendimento quando o assistente começar a conversar, para acompanhar o progresso.

### Assistente: orçamento e planos

46. Como cliente, quero informar quanto posso dar de entrada e o máximo de parcela, para receber apenas opções que cabem no meu bolso.
47. Como cliente, quero conhecer os planos de pagamento com valores de entrada e parcelas, para comparar.
48. Como corretor, quero que o assistente só informe planos cadastrados e valores calculados pelo sistema, nunca números inventados.
49. Como corretor, quero que, quando nada couber no orçamento, o assistente ofereça a opção mais próxima ou um lote mais barato e registre o negócio como fora do orçamento, em vez de descartar o cliente.
50. Como cliente, quero confirmar ou reformular minha escolha de plano, para chegar numa condição que funcione.
51. Como corretor, quero que o assistente nunca negocie preço ou desconto e me chame quando o cliente pedir, para manter o controle comercial.

### Visitas e agenda

52. Como corretor, quero cadastrar minha disponibilidade semanal e bloquear datas, para que o assistente só marque visitas quando posso ir.
53. Como corretor, quero conectar meu Google Calendar, para que o assistente não marque visita em horário em que já tenho compromisso.
54. Como cliente, quero receber opções de horário livres e escolher uma, para marcar a visita sem trocar dezenas de mensagens.
55. Como corretor, quero que a visita seja marcada direto, sem precisar confirmar, e apareça como evento no meu Google Calendar.
56. Como cliente, quero receber a localização do empreendimento na confirmação da visita, para chegar sem dificuldade.
57. Como corretor, quero mudar o local de uma visita (por exemplo, para a imobiliária), para atender casos específicos.
58. Como cliente, quero receber lembrete da visita no dia anterior e na manhã do dia, para não esquecer.
59. Como corretor, quero receber lembrete das minhas visitas, para me organizar.
60. Como cliente, quero poder remarcar a visita quando não puder ir, para não perder a oportunidade.
61. Como corretor, quero que, se eu mover ou apagar o evento no Google Calendar, a visita seja atualizada e o cliente avisado, para não manter duas agendas.
62. Como cliente, quero poder fechar sem visitar, para comprar logo se já estiver decidido.

### Coleta de dados

63. Como cliente, quero enviar fotos do CPF, RG e comprovante de endereço pelo WhatsApp, para não precisar ir até a imobiliária.
64. Como corretor, quero que o assistente confira se cada documento chegou e está legível, e peça de novo quando não estiver, para não descobrir isso só na proposta.
65. Como cliente, quero informar dois contatos de referência, porque a incorporadora exige.
66. Como cliente, quero informar e-mail e outros dados de contato, para completar meu cadastro.
67. Como cliente, quero dizer como pretendo pagar (cartão ou Pix) e o melhor dia do mês para pagamento, para que a proposta reflita minha preferência.
68. Como cliente, quero escolher um lote entre os disponíveis, para garantir o que quero.
69. Como corretor, quero que os documentos fiquem guardados de forma privada e só visíveis para mim, para proteger os dados do cliente.
70. Como corretor, quero apagar os dados e documentos de um cliente a pedido dele, para cumprir a LGPD.
71. Como corretor, quero que o negócio vá para Coletando dados quando o cliente decidir fechar, para acompanhar o progresso.

### Pendências e avisos ao corretor

72. Como corretor, quero ver uma lista de pendências (propostas a revisar, perguntas sem resposta, clientes que pediram uma pessoa), para saber o que precisa de mim.
73. Como corretor, quero receber no meu WhatsApp um aviso com link quando surgir uma pendência, porque passo o dia no WhatsApp e não no CRM.
74. Como corretor, quero resolver uma pendência pelo celular a partir do link, para não precisar de computador.

### Corretor assumindo a conversa

75. Como corretor, quero responder um cliente direto do meu celular e que o assistente pare de responder naquela conversa, para que não falemos os dois ao mesmo tempo.
76. Como corretor, quero devolver a conversa ao assistente com um toque, para que ele retome o acompanhamento.
77. Como corretor, quero que o assistente retome sozinho depois de 24h sem eu escrever, para que o cliente não fique abandonado se eu esquecer.

### Follow-up

78. Como corretor, quero que o assistente faça follow-up com clientes que pararam de responder (1, 3 e 7 dias, depois a cada 2 semanas), para minimizar clientes perdidos por silêncio.
79. Como corretor, quero que o follow-up seja contextual, com base na conversa, e não uma mensagem genérica, para que o cliente se reengaje.
80. Como corretor, quero que follow-ups e lembretes só saiam entre 8h e 20h, de segunda a sábado, para não incomodar o cliente.
81. Como corretor, quero que o follow-up pare depois de 90 dias de silêncio e o negócio apareça num filtro de silenciosos, para não insistir indefinidamente e poder reativar depois.
82. Como corretor, quero que nenhum negócio vá para Perdido automaticamente, para que só eu decida isso.
83. Como cliente, quero dizer que não tenho interesse e nunca mais receber mensagens do assistente, para ser respeitado.
84. Como corretor, quero que o assistente não faça follow-up em conversas que eu assumi, e que o sistema me lembre de fazer, para não perder o cliente.
85. Como corretor, quero que o cliente receba lembretes práticos nas etapas finais (documentos, assinatura, pagamento), para que a venda não trave.

### Proposta e reserva

86. Como corretor, quero que o sistema monte a proposta preenchendo o modelo da incorporadora com os dados do cliente, lote, modelo de casa, plano e data de pagamento, para não digitar nada.
87. Como corretor, quero revisar e aprovar a proposta antes de ela ir para o cliente, porque ela é um compromisso de preço e lote.
88. Como corretor, quero que o negócio fique em Proposta em revisão enquanto aguarda minha aprovação, para que a pendência fique visível.
89. Como corretor, quero que, ao enviar a proposta, o lote fique reservado por 72h, para que ninguém mais o ofereça.
90. Como corretor, quero que o sistema impeça criar proposta para um lote reservado ou vendido, para nunca vender o mesmo lote duas vezes.
91. Como corretor, quero prorrogar uma reserva manualmente, para atender um cliente que precisa de mais tempo.
92. Como corretor, quero que a reserva expire e libere o lote se a proposta não for assinada a tempo, para não travar o estoque.

### Assinatura e pagamento

93. Como cliente, quero receber a proposta em PDF com instruções para assinar no gov.br, para assinar sem sair de casa.
94. Como cliente, quero mandar a proposta assinada de volta pelo WhatsApp, para concluir essa etapa.
95. Como corretor, quero confirmar que a assinatura recebida é válida, para que o negócio avance para Aguardando pagamento.
96. Como cliente, quero receber os dados para pagar a entrada, para efetuar o pagamento.
97. Como cliente, quero enviar o comprovante de pagamento pelo WhatsApp, para comprovar que paguei.
98. Como corretor, quero confirmar o comprovante e ver o negócio ir para Ganho e o lote para vendido, para fechar a venda no sistema.

### Operação

99. Como administrador, quero que o sistema rode num VPS com Podman, com arquivos no Cloudflare R2, para ter custo baixo e controle da infraestrutura.

## Implementation Decisions

### Arquitetura

- **Código em `src/`**: `src/app` (Next.js), `src/db` (schema Drizzle), `src/domain` (módulo de domínio, `createDomain`), `src/adapters` (interfaces e falsos), `src/test` (harness de testes). Migrations ficam em `drizzle/` na raiz.
- **Um módulo de domínio** é a única porta de entrada para regras de negócio. Páginas e server actions do Next.js, o worker e as ferramentas do assistente chamam esse módulo; nenhum deles acessa o banco diretamente para regras de negócio.
- Termos do `GLOSSARY.md` em pt-BR no código; pastas, nomes de padrão e adaptadores em inglês (ADR-0003).
- **Toda tabela de domínio referencia a imobiliária** dona (ADR-0001), e toda consulta do módulo de domínio é escopada por imobiliária. Clientes, negócios, conversas e documentos são também escopados pelo corretor dono; o catálogo e o status de lotes são compartilhados na imobiliária.
- **Adaptadores atrás de módulos próprios**, cada um com uma implementação real e uma falsa em memória para testes (`<Nome>Fake`):
  - **WhatsApp**: Evolution API auto-hospedada (ADR-0004). Interface: conectar instância (QR code), estado da conexão, enviar texto/mídia/localização, e eventos de mensagem recebida, incluindo `fromMe` e indicação de grupo. Nenhum outro módulo conhece a Evolution API, para que migrar para a Cloud API oficial troque só este adaptador.
  - **LLM**: OpenAI. `gpt-6-luna` pela Responses API com tool calling; `text-embedding-3-small` para embeddings; transcrição de áudio da OpenAI.
  - **Calendar** (agenda): Google Calendar (OAuth por corretor): horários ocupados, criar, atualizar e remover evento, e detectar alteração ou remoção de eventos de visita.
  - **Storage** (armazenamento): Cloudflare R2 (S3-compatível) para documentos, material de marketing, modelos e propostas. Arquivos de clientes ficam privados e são acessados por URLs assinadas de curta duração.
  - **Clock** (relógio): abstração de tempo, para que cadências, expiração de reserva e janela de horário sejam testáveis.
- **Worker** de jobs agendados, separado do servidor web: follow-ups, lembretes de visita e de etapas finais, expiração de reservas, retomada do assistente após 24h e sincronização com o Google Calendar. Ele lê o estado do banco e chama o módulo de domínio.
- **Autenticação**: Better Auth com Drizzle no mesmo Postgres. Papéis `administrador` (sem imobiliária) e `corretor` (pertence a uma imobiliária). A página de administração exige `administrador`. Não há cadastro público.
- **Infraestrutura**: um VPS com Podman (compose) rodando Next.js, worker, Postgres 17 com pgvector, e Evolution API com Redis. O `docker-compose.yml` atual é a base.

### Modelo de domínio

- **Imobiliária** → corretores; catálogo compartilhado.
- **Incorporadora** → **Empreendimento** (nome, cidade, endereço/localização, base de conhecimento, material de marketing, planos de pagamento, modelo de proposta herdado da incorporadora).
- **Lote**: quadra, número, área, frente, fundo, preço, status `disponível | reservado | vendido`. A importação por planilha cria ou atualiza lotes por quadra + número.
- **Modelo de casa**: área construída, quartos, banheiros, suítes, vagas, preço; pertence a um empreendimento.
- **Plano de pagamento**: pertence a um empreendimento. Estrutura provisória: percentual de entrada, número de parcelas e texto livre de condições (correção, taxas). O cálculo de entrada e parcela fica num único ponto do módulo de domínio, porque **a regra definitiva (com taxas) ainda será definida** e vai substituir só esse cálculo.
- **Cliente**: pertence a um corretor; nome, telefone, e-mail, CPF, documentos, duas referências, forma de pagamento pretendida, dia de pagamento preferido.
- **Negócio**: pertence a um cliente e ao corretor dono; tem lote e modelo de casa de interesse (opcionais), plano escolhido, orçamento informado (entrada e parcela máxima), indicador "fora do orçamento", etapa, motivo de perda e histórico de mudanças de etapa.
- **Etapas fixas**: Novo → Em atendimento → Visita agendada → Coletando dados → Proposta em revisão → Aguardando assinatura → Aguardando pagamento → Ganho | Perdido. "Fechar agora" pula Visita agendada. Só o corretor (ou a recusa explícita do cliente) leva a Perdido.
- **Conversa**: a conversa de WhatsApp de um cliente com o número do corretor; guarda mensagens (texto, mídia, transcrições), autor (cliente, assistente, corretor), estado do assistente (`ativo | pausado | desligado`), momento da última mensagem manual do corretor e opt-out.
- **Visita**: negócio, data e hora, local (padrão: endereço do empreendimento; editável pelo corretor), referência ao evento do Google Calendar, estado.
- **Disponibilidade**: janelas semanais por corretor e datas bloqueadas.
- **Proposta**: negócio, lote, modelo de casa, plano, data de pagamento, PDF gerado, PDF assinado, estado (`em revisão | aprovada/enviada | assinada | expirada`).
- **Reserva**: lote, proposta, expira em (envio + 72h), prorrogável manualmente. Um lote só tem uma reserva ativa, e a garantia disso vem do banco (restrição/transação), não só da aplicação.
- **Pendência**: corretor, negócio, tipo (revisar proposta, pergunta sem resposta, cliente pediu pessoa, confirmar assinatura, confirmar pagamento), estado.
- **Base de conhecimento**: texto por empreendimento quebrado em trechos com embeddings em pgvector; a busca é sempre filtrada pela imobiliária.
- **Aceite de risco do WhatsApp**: corretor e data/hora do aceite.

### Assistente

- Um assistente por corretor; atende pelo número do corretor.
- **Quem ele atende**: só números sem histórico de conversa com o corretor no momento da primeira mensagem; grupos são sempre ignorados; o corretor pode ligar/desligar por conversa. Conversas antigas não são importadas; o histórico do WhatsApp só é consultado para decidir se o número é novo.
- **Ferramentas** (tool calling), todas implementadas via módulo de domínio: buscar na base de conhecimento, enviar material de marketing (lote / lote + casa), listar planos e lotes que cabem no orçamento, calcular plano, registrar dados do cliente, registrar documento recebido, listar horários livres, agendar/remarcar visita, escolher lote, solicitar proposta, criar pendência, mudar etapa, registrar opt-out. O assistente não acessa o banco diretamente e nunca produz valores que não venham de uma ferramenta.
- **Identidade**: apresenta-se como "assistente virtual do(a) {corretor}" e diz que é IA quando perguntado.
- **Limites**: não negocia preço nem dá desconto; não promete o que não está na base de conhecimento (cria pendência); passa para o corretor quando o cliente pede uma pessoa.
- **Pausa**: mensagem `fromMe` do celular do corretor pausa o assistente naquela conversa; ele retoma com "devolver ao assistente" ou automaticamente após 24h sem mensagem do corretor.
- **Horário**: responde mensagens recebidas 24/7; follow-ups e lembretes só entre 8h e 20h, de segunda a sábado (horário de Brasília).
- **Follow-up**: durante o atendimento, 1d, 3d, 7d e depois a cada 2 semanas após a última mensagem do cliente, até 90 dias de silêncio; depois disso o negócio fica "silencioso" (aberto, sem envios). Nas etapas Coletando dados, Aguardando assinatura e Aguardando pagamento, lembretes a cada 2 dias até a expiração da reserva quando houver. Conversas pausadas pelo corretor não recebem follow-up; o corretor recebe lembrete. Opt-out encerra todo contato e leva o negócio a Perdido com motivo "sem interesse".
- **Documentos**: o assistente verifica presença e legibilidade (via modelo multimodal), não autenticidade.
- **Áudio**: transcrito ao chegar; a transcrição é salva com a mensagem; o assistente responde só em texto.
- **Avisos ao corretor**: um número de sistema (instância Evolution própria) envia ao corretor uma mensagem com link para cada pendência, respeitando 8h–20h exceto para "cliente pediu pessoa" e "revisar proposta".

### Proposta, assinatura e pagamento

- Modelo de proposta por incorporadora com campos substituíveis; o sistema gera o PDF e cria uma pendência "revisar proposta". A aprovação do corretor envia o PDF ao cliente com instruções de assinatura no gov.br e cria a reserva.
- O PDF assinado chega pelo WhatsApp, é anexado à proposta e gera a pendência "confirmar assinatura". A confirmação leva a Aguardando pagamento e envia os dados de pagamento da entrada.
- O comprovante chega pelo WhatsApp e gera a pendência "confirmar pagamento". A confirmação leva o negócio a Ganho e o lote a vendido. O sistema não processa pagamentos.

## Testing Decisions

- **Um bom teste exercita comportamento externo** pelo módulo de domínio: dado um estado e um evento (mensagem recebida, ação do corretor, passagem do tempo), verifica o estado resultante e os efeitos nos adaptadores falsos (mensagens enviadas, eventos de agenda, arquivos). Testes não inspecionam detalhes internos nem chamam funções auxiliares privadas.
- **Seam principal**: o módulo de domínio, com **Postgres real** (container Podman com pgvector) em testes. Cada teste isola seus dados: por padrão uma transação revertida (`withRollback`); testes de concorrência usam uma imobiliária nova por teste.
- **Adaptadores falsos** (`src/adapters`, montados por `createTestDomain`): `WhatsAppFake` (registra envios, simula recebimentos e `fromMe`), `LLMFake` (respostas e chamadas de ferramenta roteirizadas), `CalendarFake` (eventos em memória), `StorageFake` (arquivos em memória), `ClockFake` (avançado pelo teste).
- **O assistente é testado pelo mesmo seam**: "chega uma mensagem para o corretor X" com o `LLMFake` roteirizado, verificando quais ferramentas surtiram efeito, que mensagens saíram e como o negócio mudou. A qualidade do texto gerado pela IA não é testada automaticamente.
- **Módulos com testes**: regras de etapas, reserva (incluindo concorrência: duas propostas para o mesmo lote), cálculo de plano, filtro por orçamento, disponibilidade de horários (janelas ∩ agenda), cadência de follow-up e janela de horário, pausa/retomada do assistente, regra de "número novo", escopo por imobiliária e por corretor, importação de lotes.
- **Runner**: `bun test`. O ticket de fundação criou o primeiro (`src/domain/imobiliarias.test.ts`), que serve de referência para os demais.
- Adaptadores reais (Evolution, OpenAI, Google, R2) são finos e verificados manualmente no ambiente de deploy, não por testes automatizados.

## Out of Scope

- Envio da venda à incorporadora (passo 17 do fluxo): acontece fora do sistema.
- Regra definitiva do plano de pagamento com taxas: será definida depois; o MVP usa a estrutura provisória.
- Papel de gestor, rankings e qualquer visão de um corretor sobre a carteira de outro.
- Cadastro público e cobrança de imobiliárias (multi-imobiliária como produto).
- WhatsApp Cloud API oficial, templates e janela de 24h (ADR-0004).
- Importação de conversas antigas do WhatsApp.
- Revenda, apartamentos, locação, e qualquer imóvel que não seja lote ou lote + casa.
- Integração com portais (ZAP, VivaReal, OLX) e captação fora do WhatsApp (exceto cadastro manual).
- Fotos de lotes e publicação de anúncios.
- Processamento de pagamentos (gateway, Pix QR, link de cartão).
- Assinatura eletrônica integrada (ZapSign, Clicksign); a assinatura é feita pelo cliente no gov.br.
- Validação de autenticidade de documentos.
- O assistente enviar áudio; negociação de preço ou desconto pelo assistente.
- Detecção de cliente duplicado entre corretores.
- Configuração de etapas ou cadências pelo usuário.

## Further Notes

- **Em aberto:** se o Google Calendar é obrigatório ou opcional (corretor sem Google usaria só a disponibilidade do CRM). A implementação deve tratar a agenda como opcional até a decisão.
- **Risco aceito:** a Evolution API viola os Termos do WhatsApp e pode levar ao banimento do número do corretor (ADR-0004). Mensagens automáticas em excesso aumentam esse risco, o que reforça a cadência moderada de follow-up.
- Mensagens enviadas pelo WhatsApp for Windows ou outros dispositivos sem suporte podem não ser vistas como `fromMe`; o assistente pode não pausar nesses casos.
- O número de sistema que avisa corretores é uma instância Evolution separada, num chip próprio, para que um banimento dele não afete os corretores.
