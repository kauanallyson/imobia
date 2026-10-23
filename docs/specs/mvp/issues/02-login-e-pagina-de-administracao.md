# 02: Login e página de administração

**What to build:** O administrador entra numa página de administração que só ele acessa, cria uma imobiliária e cria corretores com e-mail e senha. Um corretor entra com e-mail e senha e vê um painel vazio pensado para celular. Corretores podem ser desativados. Usa Better Auth com Drizzle, com papéis `administrador` (sem imobiliária) e `corretor` (pertence a uma imobiliária). Não há cadastro público.

**Blocked by:** 01 (Fundação do domínio e harness de testes)

**Status:** done

- [x] O administrador cria imobiliárias e corretores pela página de administração
- [x] Um corretor não consegue acessar a página de administração
- [x] Um corretor entra com e-mail e senha e vê seu painel (layout mobile-first)
- [x] Um corretor desativado não consegue entrar
- [x] Não existe rota de cadastro público
- [x] Testes cobrem as regras de papel e o escopo por imobiliária
