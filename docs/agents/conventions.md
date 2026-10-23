# Convenções para implementar tickets

Aprendidas no ticket 02. A arquitetura (pastas, DAL, permissão, DTOs, Server Actions) está em `docs/specs/mvp/spec.md` → Implementation Decisions; aqui ficam o fluxo de trabalho e as pegadinhas que o código não conta.

## Fluxo de um ticket

1. `git switch main && git switch -c ticket/NN-<slug>` antes de qualquer mudança. Todo ticket tem a própria branch; o commit do ticket fica nela.
2. Combine os seams de teste com o usuário (AskUserQuestion) antes do primeiro teste. Seams usados até agora: funções de `src/data` contra o Postgres de teste, `auth.api` para login e `sessionFromHeaders(headers)` para a sessão do request.
3. Red → green por slice, com `bun test <arquivo>`. `bun run typecheck` a cada slice que mexe em tipos; `bun run test`, `bun run lint` e `bun run build` no fim (o build pega erros de Cache Components que o typecheck não pega).
4. Rode o app de verdade para conferir a interface (veja "Conferir no navegador").
5. Revise com `/code-review`, corrija, marque o ticket como `done` com as caixas marcadas e faça o commit.

## Dados (`src/data`)

- **Idempotência.** Toda ação que cria algo recebe um `id` gerado pelo servidor na renderização (`crypto.randomUUID()` na página, campo hidden no formulário). A DAL insere com `.onConflictDoNothing()` e, sem linha devolvida, relê pelo `id`: reenviar ou clicar duas vezes devolve o registro já criado, inclusive com envios simultâneos. Ações que mudam estado (desativar, mudar etapa, aprovar) são escritas como "levar ao estado X", que repetir não altera. Jobs do worker e webhooks seguem a mesma regra: chave natural (id da mensagem da Evolution, negócio + tipo + data do lembrete) com unique no banco. Referência: `criarImobiliaria`, `createUser`, `desativarCorretor`.
- **Fora do escopo é `null`.** Busca ou criação que aponta para algo fora da imobiliária da sessão (ou inexistente) devolve `null`; papel errado lança `ForbiddenError`. Ids que não são UUID devolvem `null` antes de consultar.
- **Usuários e login.** Better Auth guarda `users`, `sessions`, `accounts` e `verifications` (nomes em inglês por serem infraestrutura). Usuários só nascem em `createUser` (`src/data/users.ts`); não existe `/api/auth` nem cadastro público. Campos próprios em `users`: `role` (`administrador | corretor`), `imobiliariaId` (CHECK: só corretor tem), `ativo`.
- **Sessão fora de um request** (worker, assistente): monte `{ role: "corretor", corretorId, imobiliariaId }` do corretor dono do negócio.
- **Testes** usam os fixtures de `src/test/fixtures.ts` (`administrador`, `criarAna`); amplie esse arquivo em vez de recriar setup em cada teste.

## Interface (`src/app`)

- **Componentes MUI 9**, tema claro em `src/app/theme.ts`, fonte Tuffy (fallback Roboto, sans-serif), ícones `lucide-react` em todo botão de ação (`startIcon`, ou o `icon` de `SubmitButton`). O app se chama **loteAI**.
- **Mobile-first**: uma coluna, `Container maxWidth="sm"`, alvos de toque de 44px+. Conferir em 390px de largura.
- **Estilo com `sx`**: MUI 9 não aceita system props (`fontWeight={700}` não compila; use `sx={{ fontWeight: 700 }}`). Tuffy só tem pesos 400 e 700.
- **Links em componentes MUI**: passe `component={Link}` com `Link` de `@/app/components/link` (re-export client). `next/link` direto quebra o build quando usado a partir de Server Component.
- **Formulários**: Client Component com `useActionState`, `Field`/`SubmitButton` de `@/app/components/form`, erro num `Alert`. O React limpa o formulário depois da action; para manter um valor após erro, devolva-o no estado e use como `defaultValue` (ver `login-form.tsx`).
- **Sessão e Cache Components**: ler a sessão (`getSession`, `verificarAdministrador`, `verificarCorretor`) só dentro de `<Suspense>`. A checagem de papel fica no componente que envolve a página ou o layout inteiro, para que nenhum conteúdo protegido entre no shell estático; a DAL checa de novo.
- **Rotas de cada papel**: `homePath(role)` em `src/data/session.ts` é o único mapa papel → página inicial.

## Scripts e ambiente

- Scripts que importam `src/data` rodam com `bun --conditions=react-server` (por causa do `server-only`); modelo: `admin:create`.
- Env nova: adicione em `src/lib/env.ts`, `.env.example` e, se os testes precisarem, em `src/test/setup.ts`.

## Conferir no navegador

`bun run build`, um banco descartável no container de teste (`create database crm_e2e`, `DATABASE_URL=... bun run db:migrate`, `bun run admin:create`) e `bun run start -p 3100` com `BETTER_AUTH_URL=http://localhost:3100`. Os scripts `dev`, `build` e `start` rodam o Next no runtime do Bun (`bun --bun`); chame-os pelo `bun run`, não por `bunx next`, que usa Node. Dirija com Playwright usando o Chromium já baixado em `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`. Pegadinhas:

- Cache Components mantém a rota anterior montada e oculta: filtre seletores com `.filter({ visible: true })`.
- Rótulos de campos `required` do MUI terminam em " *"; não use `exact` em `getByLabel`.
- `getByRole("alert")` também acha o anunciador de rota do Next; para erros de formulário use `.MuiAlert-root`.
- Pare o servidor pelo PID e apague o banco descartável no fim.
