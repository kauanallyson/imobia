# DAL simples do Next.js em vez de ports & adapters

Substitui o ADR-0005. Ports & adapters, repositórios e injeção de dependência não são comuns em projetos Next.js e pesam demais para um MVP que ainda precisa validar a ideia. Seguimos a recomendação da documentação do Next. As regras de negócio, as consultas Drizzle e a checagem de permissão ficam em funções de uma Data Access Layer (`src/data`, `server-only`), que devolvem só as colunas necessárias. Server Actions e páginas chamam essas funções. Cada serviço externo é um módulo de funções em `src/lib`.

## Consequências

- Testes não injetam dependências. Integrações são trocadas por falsos com `mock.module` do Bun, e o tempo é controlado com `setSystemTime`. O banco é um Postgres real limpo a cada teste.
- **Dívida aceita:** a DAL fala direto com o Drizzle, e nenhuma integração tem interface própria. Se o produto validar e houver necessidade real (troca de provedor, várias implementações), extraímos a abstração nesse momento.
- A saída planejada no ADR-0004 continua valendo: só `src/lib/whatsapp.ts` conhece a Evolution API.
