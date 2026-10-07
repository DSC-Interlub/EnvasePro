/**
 * scripts/lib/db-guard.js
 *
 * Guard obrigatório contra execução acidental contra a base de PRODUÇÃO.
 *
 * Modelo de segurança: ALLOWLIST, não blocklist.
 *   Só `localhost` e `127.0.0.1` são aceitos por padrão. Qualquer outro host
 *   (produção, um projeto remoto desconhecido, ou URL vazia) é bloqueado.
 *   A versão anterior deste arquivo era uma blocklist: bloqueava apenas o ref
 *   de produção conhecido, deixando passar qualquer outro alvo remoto.
 *
 * Checa VITE_SUPABASE_URL, SUPABASE_URL, SUPABASE_DB_URL e SUPABASE_PROJECT_REF.
 * Basta UMA delas apontar para fora do local para o script abortar.
 *
 * Para rodar contra produção é preciso DUAS confirmações explícitas:
 *   node scripts/x.js --allow-production --confirm-ref=<ref-exato-do-alvo>
 * Não existe atalho por variável de ambiente (o antigo ALLOW_PRODUCTION=true
 * foi removido de propósito: permitia burlar o guard sem nenhuma flag).
 *
 * IMPORTANTE: chame enforceNonProductionGuard() DEPOIS do dotenv.config() e
 * ANTES de criar o client.
 */

export const PRODUCTION_PROJECT_REF = 'xifzjpbkpxislqrowswd';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

const ENV_VARS_URL = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_DB_URL'];

function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    // Não parseou: trata como alvo desconhecido, portanto não-local.
    return null;
  }
}

/** Extrai o project-ref de uma URL do Supabase (https://<ref>.supabase.co). */
function refFromUrl(rawUrl) {
  const host = hostOf(rawUrl);
  if (!host || !host.endsWith('.supabase.co')) return null;
  return host.split('.')[0];
}

/**
 * Inspeciona o ambiente e devolve o veredito, sem abortar.
 * Útil para testes do próprio guard.
 */
export function inspectTarget(env = process.env) {
  const findings = [];
  let anyUrlPresent = false;

  for (const name of ENV_VARS_URL) {
    const value = (env[name] || '').trim();
    if (!value) continue;
    anyUrlPresent = true;
    const host = hostOf(value);
    findings.push({
      source: name,
      host: host || '(não parseável)',
      ref: refFromUrl(value),
      isLocal: host !== null && LOCAL_HOSTS.has(host),
    });
  }

  const envRef = (env.SUPABASE_PROJECT_REF || '').trim();
  if (envRef) {
    findings.push({
      source: 'SUPABASE_PROJECT_REF',
      host: `${envRef}.supabase.co`,
      ref: envRef,
      isLocal: false,
    });
  }

  const remote = findings.filter((f) => !f.isLocal);
  const refs = [...new Set(remote.map((f) => f.ref).filter(Boolean))];

  return {
    findings,
    anyUrlPresent,
    isLocal: anyUrlPresent && remote.length === 0,
    remote,
    refs,
    hitsProduction: refs.includes(PRODUCTION_PROJECT_REF),
  };
}

/**
 * Aborta o processo se o alvo não for o Supabase local, salvo dupla confirmação.
 * @param {string} contextLabel rótulo do script, só para a mensagem de erro.
 */
export function enforceNonProductionGuard(contextLabel = 'Script') {
  const t = inspectTarget();
  const argv = process.argv;

  const bar = '='.repeat(78);
  const die = (titulo, detalhe) => {
    console.error(`\n${bar}`);
    console.error(`⛔ BLOQUEIO DE SEGURANÇA — ${titulo}`);
    console.error(bar);
    console.error(`[${contextLabel}] Operação abortada antes de qualquer acesso ao banco.`);
    for (const f of t.findings) {
      console.error(`  ${f.source} -> host=${f.host}${f.ref ? ` ref=${f.ref}` : ''} ${f.isLocal ? '[local]' : '[REMOTO]'}`);
    }
    if (!t.anyUrlPresent) console.error('  (nenhuma URL de Supabase definida no ambiente)');
    console.error('');
    console.error(detalhe);
    console.error(`${bar}\n`);
    process.exit(1);
  };

  if (!t.anyUrlPresent) {
    die(
      'ALVO NÃO DEFINIDO',
      'Defina VITE_SUPABASE_URL (e SUPABASE_URL) no .env.local apontando para o\n' +
        'Supabase local. Rode `npx supabase start` e use a URL que ele imprime.\n' +
        'Sem alvo definido o guard não consegue provar que não é produção.'
    );
  }

  if (t.isLocal) return; // caminho feliz: tudo aponta para localhost

  // Daqui para baixo o alvo é remoto.
  const quemSou = argv[1] || 'script.js';
  const alvo = t.refs[0] || '(ref desconhecido)';

  if (!argv.includes('--allow-production')) {
    die(
      t.hitsProduction ? `ALVO É A BASE DE PRODUÇÃO (${PRODUCTION_PROJECT_REF})` : 'ALVO REMOTO NÃO AUTORIZADO',
      'Este guard só libera `localhost`/`127.0.0.1` por padrão.\n' +
        'Para rodar deliberadamente contra um alvo remoto são necessárias DUAS\n' +
        'confirmações explícitas, digitando o ref do alvo:\n\n' +
        `  node ${quemSou} --allow-production --confirm-ref=${alvo}\n\n` +
        'Não há atalho por variável de ambiente.'
    );
  }

  const confirmArg = argv.find((a) => a.startsWith('--confirm-ref='));
  const confirmado = confirmArg ? confirmArg.slice('--confirm-ref='.length).trim() : '';

  if (!confirmado) {
    die(
      'SEGUNDA CONFIRMAÇÃO AUSENTE',
      '`--allow-production` sozinho não basta. Digite também o ref exato do alvo:\n\n' +
        `  node ${quemSou} --allow-production --confirm-ref=${alvo}`
    );
  }

  if (!t.refs.includes(confirmado)) {
    die(
      'REF CONFIRMADO NÃO CORRESPONDE AO ALVO',
      `Você digitou  --confirm-ref=${confirmado}\n` +
        `mas o ambiente aponta para: ${t.refs.join(', ') || '(ref desconhecido)'}\n\n` +
        'Confira o .env.local antes de insistir: digitar o ref errado costuma\n' +
        'significar que o ambiente carregado não é o que você pensa.'
    );
  }

  console.warn(`\n${bar}`);
  console.warn(`⚠️  [${contextLabel}] RODANDO CONTRA ALVO REMOTO: ${confirmado}`);
  if (t.hitsProduction) console.warn('⚠️  ESTE É O PROJETO DE PRODUÇÃO. Confirmado em dobro pela linha de comando.');
  console.warn(`${bar}\n`);
}

export default enforceNonProductionGuard;
