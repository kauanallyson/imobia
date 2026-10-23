# Nomes de domínio em português no código

Tabelas, tipos e funções de domínio usam os termos em pt-BR do GLOSSARY.md (`negocio`, `corretor`, `lote`); só código de framework e infraestrutura fica em inglês. Glossário, interface e código compartilham um único vocabulário, sem tradução entre camadas. Não "corrigir" para inglês.

**Atualização:** a fronteira é o glossário. Só termos do `GLOSSARY.md` ficam em pt-BR (`imobiliarias`, `criarImobiliaria`, `corretorId`). Pastas (`src/data`, `src/lib`, `src/test`), nomes técnicos e módulos de integração com suas funções (`sendText`, `signedUrl`) ficam em inglês. Comentários e textos para o usuário seguem em pt-BR.
