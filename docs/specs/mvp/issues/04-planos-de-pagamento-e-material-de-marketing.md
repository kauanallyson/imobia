# 04: Planos de pagamento e material de marketing

**What to build:** Um corretor cadastra planos de pagamento por empreendimento (percentual de entrada, número de parcelas, texto de condições) e vê o valor de entrada e de parcela calculado para um lote ou lote + casa. O cálculo é **provisório** e fica num único ponto do módulo de domínio, porque a regra definitiva com taxas será definida depois. O corretor também envia arquivos de material de marketing (PDF, imagem, vídeo) para o R2, marcando cada um como de lote, lote + casa ou ambos.

**Blocked by:** 03 (Catálogo: empreendimentos, lotes e modelos de casa)

**Status:** ready-for-agent

- [ ] Corretor cadastra planos por empreendimento e vê entrada e parcela calculadas para lote e para lote + casa
- [ ] O cálculo de plano está concentrado num único ponto, coberto por testes
- [ ] Corretor envia, lista e remove material de marketing marcado por tipo (lote / lote + casa / ambos)
- [ ] Arquivos vão para o adaptador de Armazenamento (falso em testes, R2 em produção)
- [ ] Uma consulta de domínio devolve o material certo para "lote" e para "lote + casa"
