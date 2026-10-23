# 19: Transcrição de áudio

**What to build:** Áudios recebidos do cliente são transcritos ao chegar (transcrição da OpenAI), e a transcrição é salva junto com a mensagem e exibida na conversa no CRM. O assistente responde ao conteúdo do áudio sempre em texto.

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** done

- [x] Áudio recebido é guardado e transcrito
- [x] A transcrição aparece na conversa ao lado do áudio
- [x] O assistente responde ao conteúdo transcrito, em texto
- [x] Falha na transcrição gera uma resposta pedindo que o cliente escreva ou reenvie (sem travar a conversa)
- [x] Testes usam um LLM falso (`mock.module`)

## Comments

- Sem mudança de schema: `mensagens.transcricao` já existia desde o 08 e o histórico do assistente (09) já lia `transcricao ?? texto`.
- `src/lib/whatsapp.ts#baixarMidia` usa `POST /chat/getBase64FromMediaMessage` só com `key.id`; `src/lib/llm.ts#transcrever` usa `audio.transcriptions.create` com o modelo de `OPENAI_TRANSCRIBE_MODEL` (padrão `gpt-transcribe`, env nova com default; `languages: ["pt"]` para gpt-transcribe, `language` para os antigos). O ogg/opus do WhatsApp vai como `audio.ogg`; se a API recusar, trocar para `convertToMp4: true` na Evolution.
- Hook em `receberMensagem`: só na primeira gravação da mensagem (reentrega do webhook não transcreve nem reenvia nada). Com transcrição, o assistente atende normalmente; sem transcrição o modelo não é chamado e o cliente recebe `PEDIDO_PARA_ESCREVER`, gravado como mensagem do assistente. O pedido só é enviado se o assistente estiver ativo na conversa (corretor no comando responde ele mesmo).
- UI do negócio: rótulo "🎤 Áudio", transcrição em itálico no balão, "Sem transcrição" quando falhou.
