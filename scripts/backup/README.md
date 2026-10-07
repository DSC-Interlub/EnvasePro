# Backup e restauração — ferramentas

Usadas na preparação do go-live. Rodam **fora** do repositório: os arquivos de
backup nunca entram no Git (ver `.gitignore`).

## Baixar os arquivos do storage de produção

```
SBP=<token de conta do Supabase> node scripts/backup/baixar-storage-producao.mjs <pasta-destino>
```

Obtém a chave de serviço pela Management API, usa **em memória** e nunca a grava
nem a imprime. Baixa os bytes de todos os objetos dos três buckets.

## Gerar e testar a restauração no banco LOCAL

```
node scripts/backup/gerar-restore-local.mjs <pasta-backup> <saida.sql>
docker cp <saida.sql> supabase_db_envase:/tmp/restore.sql
docker exec supabase_db_envase psql -U postgres -d postgres -f /tmp/restore.sql
```

O SQL gerado usa `session_replication_role = replica` para desligar triggers e
checagem de chave estrangeira durante a carga. Sem isso, a ordem das tabelas
passaria a importar e os próprios triggers de proteção recusariam a restauração.

### Duas limitações, declaradas

1. **As contas de autenticação não estão no backup.** `auth_users_sem_senha.json`
   traz e-mail, id e papel, mas **não traz senha nem hash** — a Management API
   não os expõe. Numa restauração real as 4 contas precisam ser recriadas e as
   senhas redefinidas. O `user_profiles` restaura, mas sua chave estrangeira
   para `auth.users` só passa porque a checagem está desligada durante a carga.
2. **Coluna gerada.** `nota_fiscal_arquivos.data_expiracao_legal` é
   `GENERATED ALWAYS` e não aceita INSERT; fica de fora e é recalculada sozinha.

### Último teste de restauração

07/10/2026, no banco local: **24 de 24 tabelas conferem, 1869 de 1869 linhas**.
