# Limpeza total de produção (20/10/2026)

Autorizada pelo dono por escrito: "excluir absolutamente tudo, tudo mesmo,
inclusive os usuários; os dados são de teste". **O dono roda o comando.** O
Claude preparou, ensaiou e conferiu.

## Antes: snapshot verificado

`C:\Users\kauan.pereira\EnvasePro-backups\prod_2026-10-20T13-09-13Z_PRE-LIMPEZA-100`

- DDL inteira, dados de toda tabela com linha, lista de contas e perfis (sem
  senha; a Management API não expõe hash) e os arquivos do Storage (0 arquivos).
- `verificar-snapshot.mjs`: **40 OK, 0 falha** (sha256, contagens relidas em
  produção, restauração no banco local conferida linha a linha).
- O backup dos cadastros reais continua onde estava, intacto:
  `prod_2026-10-08T12-20-02Z_PRE-LIMPEZA-TOTAL\RESTAURAR-CADASTROS.sql`.

O que havia em produção: 1 config de empilhadeira, 3 envases, 1 operador,
1 produto, 6 perfis, 6 contas (40 sessões, 40 tokens de renovação), 0 arquivos.

## O comando

```
node scripts/limpar-producao-total.mjs --allow-production --confirm-ref=xifzjpbkpxislqrowswd --commit
```

Sem `--commit` é ENSAIO: roda tudo e desfaz. Sem as duas confirmações, recusa.

Numa transação só:

1. `TRUNCATE ... RESTART IDENTITY CASCADE` nas 25 tabelas de `public`;
2. as 6 sequences de protocolo voltam ao início (`setval(..., 1, false)`):
   o primeiro protocolo de cada tipo depois da limpeza é `...-000001`;
3. `DELETE FROM auth.users`: identities, sessions, refresh tokens, fatores MFA
   e `user_profiles` saem pelas chaves `ON DELETE CASCADE`;
4. dentro da mesma transação confere que tudo ficou em zero; se sobrar uma
   linha, nada é gravado.

**Por que as travas de imutabilidade não bloqueiam:** os 52 gatilhos de
`public` são por linha (`BEFORE UPDATE` / `BEFORE DELETE`). `TRUNCATE` não
dispara gatilho por linha, só gatilho `ON TRUNCATE`, e não existe nenhum
(conferido em produção antes). As travas continuam lá, intactas.

**O que NÃO muda:** esquema, funções, RLS, GRANTs, migrations, histórico,
buckets (privados, com limite de tamanho e de tipo) e políticas de Storage.

## Ensaio (20/10/2026)

Dentro da transação tudo foi a zero; depois do `ROLLBACK`, todas as linhas e
contas voltaram. **Uma exceção, declarada:** o primeiro ensaio chamava
`setval`, que **não é transacional**, e deixou `seq_envase_protocolo` no início
(estava em 3) antes da hora. O script foi corrigido: o ensaio não mexe mais em
sequence. A limpeza real a zera de qualquer forma.

## Depois da limpeza

O sistema fica sem nenhuma conta. O cadastro público é fechado, então a
primeira conta administradora é criada pelo servidor (Claude, com o login da
CLI) e as demais **pela tela Gerenciar Usuários**.

## Restaurar os cadastros reais (quando o dono quiser)

1.599 produtos, 52 embalagens, os 14 operadores reais (os 13 de teste `QA`
ficam de fora) estão em `RESTAURAR-CADASTROS.sql`. Ver
`scripts/backup/restaurar-cadastros.mjs` e `docs/GO-LIVE.md`. As 6 fotos reais
estão no `base44.app`: baixar e subir pelo cadastro de operador **antes** de a
Base44 sair do ar.

## Ordem com as migrations 20261020000001–003

**Rodar a limpeza ANTES de aplicar a `20261020000001`, a `…002` e a `…003`.** Depois dela, a tabela
`auditoria_usuarios` recusa `TRUNCATE` (é imutável por gatilho), e a limpeza
**aborta inteira**, sem apagar nada (é uma transação só). Se isso acontecer, não
há dano: é só avisar.

A `20261020000002` apaga a tabela `metas_diarias` (o dono não quer metas). O
script de limpeza não precisa de mudança: ele esvazia **todas** as tabelas de
`public` que existirem no momento, lidas do catálogo, e roda antes dela.
