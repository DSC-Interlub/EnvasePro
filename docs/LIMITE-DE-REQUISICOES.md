# Limite de requisições — passo a passo

Escrito para o dono do sistema executar no painel. Nenhum serviço novo, nenhuma
conta nova, nenhum custo adicional.

São **duas** configurações independentes, em dois painéis diferentes. Uma não
substitui a outra.

---

## O que cada uma protege — e o que não protege

| | Vercel Firewall | Supabase Auth |
|---|---|---|
| Onde | painel da Vercel | painel do Supabase |
| Protege | as rotas `/api/*` do EnvasePro (`notificarOcorrencia`, `csp-report`) | login, cadastro, recuperação de senha, renovação de sessão |
| Não protege | **nada do login** | nada das rotas `/api` |

**Isto precisa ficar claro: a regra da Vercel NÃO protege o login.**

O login não passa pela Vercel. O navegador fala direto com
`https://xifzjpbkpxislqrowswd.supabase.co/auth/v1/token`. Uma regra de firewall
em `/api/*` nunca vê esse tráfego. Quem protege o login é, e só é, o limite do
Supabase Auth da seção 2.

Pelo mesmo motivo, a regra da Vercel também não protege as consultas de dados:
elas vão direto para `/rest/v1/` no Supabase.

---

## Por que não está no `vercel.json`

A pergunta era se dava para versionar a regra junto com o código. **Não dá.**

A documentação da Vercel diz que, no `vercel.json`, as regras de firewall
aceitam apenas as ações `challenge` e `deny`; `log`, `bypass`, `redirect` e
**`rate_limit` são exclusivos do painel**. Como o que precisamos é justamente
`rate_limit`, a regra tem de ser criada no painel.

Consequência prática: **esta regra não está no Git**. Se o projeto da Vercel for
recriado, ela se perde e precisa ser refeita por este documento. Vale conferi-la
na revisão periódica.

A boa notícia: as Custom Rules do WAF estão disponíveis **em todos os planos**,
inclusive o gratuito.

---

## 1. Vercel — limite nas rotas `/api/*`

1. Entre em `vercel.com` e abra o projeto **envase-pro**.
2. Na barra lateral, clique em **Firewall**.
3. No canto superior direito, clique em **⋯** e depois em **Configure**.
4. Clique em **Add New...** → **Rule**.
5. No campo de texto do topo (descrição em linguagem natural), escreva:

   ```
   Rate limit /api to 100 requests per minute per IP
   ```

   e clique em **Generate Rule**. A Vercel monta a regra sozinha: janela de 60
   segundos, limite de 100 requisições, chaveada por IP.

   Se preferir montar à mão: em **If**, escolha `Request Path` → `starts with` →
   `/api`. Em **Then**, escolha **Rate Limit**.

6. Dê um nome que se entenda daqui a seis meses, por exemplo
   `limite /api - 100 por minuto por IP`.
7. **Primeiro teste com `Log`.** Troque a ação **Then** para **Log**, salve, e
   deixe rodando. É a prática recomendada pela própria Vercel: assim você vê
   quanto tráfego a regra pegaria antes de ela começar a barrar alguém.
8. Clique em **Save Rule**, depois em **Review Changes** e **Publish**.
9. Volte à página **Firewall** e observe o tráfego por um ou dois dias. Como o
   EnvasePro manda e-mail de ocorrência da empilhadeira, confirme que o uso
   normal fica **bem abaixo** de 100 por minuto.
10. Satisfeito, volte em **Configure**, abra a regra, troque **Then** de **Log**
    para **Rate Limit**, salve e publique de novo.

**Para desfazer:** mesma tela, selecione a regra e use **disable** ou
**delete**. Tem efeito imediato e não precisa de novo deploy.

---

## 2. Supabase — limites de autenticação

Esta é a configuração que **de fato** protege o login e a recuperação de senha.

1. Entre em `supabase.com/dashboard` e abra o projeto **EnvasePro**.
2. Menu lateral: **Authentication** → **Rate Limits**.
3. Confira, e ajuste se estiver diferente:

   | Limite | Valor sugerido | O que significa |
   |---|---|---|
   | Sign in / Sign up | **30** por 5 min por IP | tentativas de login. É o freio contra força bruta de senha |
   | Token refresh | **150** por 5 min por IP | renovação de sessão. Não aperte: as TVs renovam sozinhas o dia inteiro |
   | Token verifications | **30** por 5 min por IP | verificação de OTP / link mágico |
   | Emails sent | **2** por hora | **é este que limita a recuperação de senha**, porque ela é enviada por e-mail |
   | Anonymous sign-ins | **30** por hora | irrelevante aqui: o login anônimo está desligado |

   Esses valores são os mesmos do `supabase/config.toml` do repositório, seção
   `[auth.rate_limit]`. Mantê-los iguais evita que o arquivo e a realidade
   contem histórias diferentes.

4. **Atenção ao limite de e-mails.** O padrão é **2 por hora para o projeto
   inteiro**, não por usuário. Com o SMTP padrão do Supabase isso é muito baixo:
   se duas pessoas pedirem recuperação de senha na mesma hora, a terceira não
   recebe. Se a recuperação de senha passar a ser usada de verdade, o caminho é
   configurar um SMTP próprio em **Authentication → Emails → SMTP Settings**,
   que também libera um limite maior.

5. Na mesma área, **Authentication → Providers → Email**, confirme as duas
   coisas que já deviam estar assim:
   - **Email provider: habilitado** (sem isso ninguém entra);
   - **"Allow new users to sign up": desligado** (ninguém cria conta sozinho).

   São dois controles distintos e já houve confusão entre eles: o
   `config.toml` do repositório chegou a desligar o provedor inteiro achando
   que estava apenas barrando o cadastro.

**Para desfazer:** os mesmos campos, de volta ao valor anterior. Tem efeito
imediato.

---

## O que fica de fora, e é consciente

- **As consultas de dados (`/rest/v1/`) não têm limite de requisições.** Quem as
  segura é o RLS, e desde a migration `20261007000002` o `anon` não tem
  privilégio algum. Pôr limite nessa camada exigiria um serviço novo, que está
  fora do combinado.
- **Captcha e MFA** continuam adiados por decisão do dono.
- O limite em memória que existia na função serverless **não funcionava**: cada
  invocação na Vercel pode rodar numa instância diferente, então o contador
  nascia zerado. A regra da seção 1 substitui aquilo por algo que funciona de
  fato, porque roda na borda, antes da função.

---

Fontes: [WAF Custom Rules](https://vercel.com/docs/vercel-waf/custom-rules) ·
[Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
