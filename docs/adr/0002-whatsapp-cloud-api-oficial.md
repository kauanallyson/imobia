---
status: superseded by ADR-0004
---

# WhatsApp via Cloud API oficial da Meta

O atendente de IA fala com clientes pela WhatsApp Business Cloud API oficial, não por gateways não oficiais (Evolution API, Baileys). Follow-up automático é exatamente o comportamento que faz números não oficiais serem banidos, e um banimento perde o histórico do cliente. Aceitamos o custo: verificação do Meta Business, número dedicado, cobrança por conversa e templates pré-aprovados para mensagens fora da janela de 24h.

**Atualização:** cada corretor conecta o próprio número do WhatsApp Business app via coexistência (Embedded Signup), continuando a conversar pelo celular. O sistema detecta respostas manuais do corretor pelo webhook `smb_message_echoes`. Números de WhatsApp pessoal precisam migrar para o WhatsApp Business app antes.
