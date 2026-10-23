# WhatsApp via Evolution API (não oficial), atrás de um módulo próprio

Substitui o ADR-0002. Cada corretor conecta o próprio número por QR code a uma Evolution API auto-hospedada (protocolo WhatsApp Web via Baileys), que detecta mensagens enviadas pelo celular (`fromMe`). Escolhemos isso pelo custo: sem mensalidade por número, sem cobrança por mensagem, sem templates nem janela de 24h. A Cloud API oficial com coexistência via 360dialog foi descartada pelo custo (≈ €15–49 por corretor/mês mais as tarifas da Meta), e o Twilio porque não suporta coexistência.

## Consequências

- **Risco aceito:** isso viola os Termos do WhatsApp, e o número do corretor pode ser banido. Há relatos (não confirmados pela Meta) de uma onda de banimentos de APIs não oficiais no Brasil desde jan/2026. Um número banido leva junto o histórico de clientes do corretor.
- **Saída planejada:** todo acesso ao WhatsApp passa por um único módulo do CRM. A Evolution API também opera sobre a Cloud API oficial, então migrar um corretor para o oficial não deve exigir mudar o resto do sistema.
- Nós operamos a infraestrutura: sessões, reconexões e o celular do corretor pareado.
