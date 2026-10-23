# 19: Transcrição de áudio

**What to build:** Áudios recebidos do cliente são transcritos ao chegar (transcrição da OpenAI), e a transcrição é salva junto com a mensagem e exibida na conversa no CRM. O assistente responde ao conteúdo do áudio sempre em texto.

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** ready-for-agent

- [ ] Áudio recebido é guardado e transcrito
- [ ] A transcrição aparece na conversa ao lado do áudio
- [ ] O assistente responde ao conteúdo transcrito, em texto
- [ ] Falha na transcrição gera uma resposta pedindo que o cliente escreva ou reenvie (sem travar a conversa)
- [ ] Testes usam um LLM falso (`mock.module`)
