# EnvasePro — Sistema de Controle de Envase e Logística Interlub

Aplicação moderna para controle operacional de envase, expedição (checkout), movimentação de empilhadeiras, recebimento de materiais e notas fiscais.

---

## 📺 Configuração de Telas de TV da Fábrica (`/Televisao` e `/TelevisaoEmpilha`)

As telas de TV funcionam como qualquer outra página da aplicação e utilizam a autenticação persistente padrão do Supabase:

1. **Primeiro Acesso em uma TV Nova:**
   - Abra o navegador da TV (Smart TV, Raspberry Pi ou PC dedicado em modo tela cheia / quiosque).
   - Acesse a URL do sistema (`https://envase.interlub.com.br` ou staging).
   - Clique em **Fazer Login no Sistema** e utilize a conta de serviço compartilhada:
     - **E-mail:** `tv-fabrica@interlub.com`
     - **Senha:** *(definida no Supabase Auth)*
2. **Navegação para o Painel:**
   - Acesse a rota desejada:
     - TV Geral de Envase: `/Televisao`
     - TV de Empilhadeiras: `/TelevisaoEmpilha`
3. **Persistência de Sessão:**
   - O Supabase armazena a sessão no `localStorage` do navegador e renova o token JWT automaticamente no background (`autoRefreshToken: true`).
   - Não é necessário nenhum parâmetro especial, token ou cabeçalho customizado.
   - Mesmo que a TV seja reiniciada ou a página recarregada, a sessão permanece ativa.

---

## 🚀 Arquitetura e Tecnologias
- **Frontend:** React + Vite + Tailwind CSS + Shadcn UI + Lucide Icons + TanStack Query.
- **Backend & Auth:** Supabase PostgreSQL com Row-Level Security (RLS) estrito deny-by-default.
- **Serverless API:** Vercel Functions para rotas restritas de notificação.
