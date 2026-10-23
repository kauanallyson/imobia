# Domínio com portas e inversão de dependência, servido como Data Access Layer do Next.js

O domínio (`src/domain`) declara portas (repositórios por agregado, transação, WhatsApp, LLM, Calendar, Storage, Clock) e não importa Drizzle, Next.js nem SDKs. Implementações ficam em `src/db/repositories` e `src/adapters`, e uma raiz de composição `server-only` (`src/server/container.ts`) as monta. Para o Next.js, o domínio é a Data Access Layer recomendada no guia de segurança de dados: roda só no servidor, aplica autorização por um `Ator` explícito e devolve DTOs mínimos. Server Actions e páginas ficam finas e revalidam sessão e permissão em cada entrada.

Escolhemos isso porque várias peças já têm troca prevista: Evolution → Cloud API (ADR-0004), cálculo de plano provisório → regra com taxas, Google Calendar opcional. Também porque o mesmo domínio é chamado por quatro entradas (páginas, Server Actions, worker, ferramentas do assistente).

## Consequências

- Repositórios custam um mapeamento linha → tipo de domínio a mais por agregado. Aceitamos esse custo em troca de o domínio nunca vazar linhas do banco para a interface.
- Testes continuam contra Postgres real com os repositórios Drizzle de verdade. Não mantemos repositórios falsos, porque restrições e transações do banco fazem parte do comportamento testado.
- Variáveis de ambiente são validadas com zod em `src/server/env.ts`, importado por `next.config.ts`, para falhar no build. Esse arquivo é a exceção ao `server-only`, porque `next.config.ts` não roda no ambiente React Server. O zod também valida as entradas de Server Actions e Route Handlers.
- `server-only` fica em `src/server`, e não em `src/domain`, para que o domínio rode sob `bun test` sem as condições de exportação do React Server.
