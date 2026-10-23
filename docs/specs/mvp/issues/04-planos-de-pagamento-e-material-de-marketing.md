# 04: Planos de pagamento e material de marketing

**What to build:** Um corretor cadastra planos de pagamento por empreendimento (percentual de entrada, número de parcelas, texto de condições) e vê o valor de entrada e de parcela calculado para um lote ou lote + casa. O cálculo é **provisório** e fica numa única função de `src/data`, porque a regra definitiva com taxas será definida depois. O corretor também envia arquivos de material de marketing (PDF, imagem, vídeo) para o R2, marcando cada um como de lote, lote + casa ou ambos.

**Blocked by:** 03 (Catálogo: empreendimentos, lotes e modelos de casa)

**Status:** done

- [x] Corretor cadastra planos por empreendimento e vê entrada e parcela calculadas para lote e para lote + casa
- [x] O cálculo de plano está concentrado num único ponto, coberto por testes
- [x] Corretor envia, lista e remove material de marketing marcado por tipo (lote / lote + casa / ambos)
- [x] Arquivos vão por `src/lib/storage.ts`, com o `S3Client` nativo do Bun (`import { S3Client } from "bun"`) apontando para o R2; falso em testes
- [x] Upload e download funcionam em `bun run dev` e em `bun run start` (código pronto; conferido só com o falso — sem credenciais do R2 no ambiente, ver comentário)
- [x] Uma consulta de domínio devolve o material certo para "lote" e para "lote + casa"
- [x] Reenviar o upload do mesmo formulário não duplica o material

## Comments

**2026-10-23 (aprendizados do 02):** storage usa o cliente S3 nativo do Bun, sem SDK da AWS. Os scripts já rodam o Next no runtime do Bun (`bun --bun`, guia https://bun.com/guides/ecosystem/nextjs). Confira no build que o Next não tenta empacotar `"bun"`; se tentar, adicione em `serverExternalPackages`. Env nova entra em `src/lib/env.ts`, `.env.example` e, se preciso, `src/test/setup.ts`.

**2026-10-23 (implementação):**
- `calcularPlano` (`src/data/planos-de-pagamento.ts`) é o único ponto de cálculo. Regra provisória em centavos inteiros: entrada = piso(preço × percentual), parcela = teto((preço − entrada) ÷ n). Percentual tratado como pontos-base inteiros (até 2 casas). `calcularPlanoParaLote(session, { loteId, modeloDeCasaId?, planoId })` soma lote + casa e exige tudo no mesmo empreendimento/imobiliária.
- `src/lib/storage.ts` é o único módulo com `import { S3Client } from "bun"`; `"bun"` entrou em `serverExternalPackages`. Env: `R2_ENDPOINT` **ou** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Falso em `src/test/fakes/storage.ts` (`arquivos: Map`), registrado no preload.
- Upload via Server Action com `File` no FormData; `experimental.serverActions.bodySizeLimit = "26mb"` (arquivo ≤ 25 MB + folga do multipart). Alternativa futura: PUT assinado direto do navegador.
- Material: registro gravado antes do arquivo (idempotência pelo `id` do formulário: quem perde o conflito relê e não envia de novo); falha no upload desfaz o registro. Remover apaga o objeto e depois a linha. Chave `imobiliarias/<id>/empreendimentos/<id>/materiais/<materialId>` fica fora do DTO; a interface usa `urlDoMaterial` (assinada, 15 min). `materiaisPara(session, empreendimentoId, "lote" | "lote_e_casa")` devolve os do destino + "ambos".
- Rotas: `/painel/catalogo/empreendimentos/[id]/planos` (CRUD + simulador por lote/modelo via GET `searchParams`), `/planos/[planoId]` (editar/remover), `/materiais` (upload, lista com link assinado, remover).
- Não verificado contra o R2 real (sem credenciais aqui): a integração é fina e fica para a conferência manual no deploy, como a spec prevê.
