import https from 'https';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('verify-bundle-vercel');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('ERRO: SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.local');
  process.exit(1);
}

https.get('https://envase-pro.vercel.app/assets/index-C9MHHL3d.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('--- AUDITORIA DE SEGURANÇA DO BUNDLE EM PRODUÇÃO/STAGING NA VERCEL ---');
    console.log('Status HTTP:', res.statusCode);
    console.log('Tamanho do bundle JS baixado da Vercel:', (data.length / 1024).toFixed(2), 'KB');
    console.log('1. A string secreta SUPABASE_SERVICE_ROLE_KEY está no bundle?', data.includes(serviceKey));
    console.log('2. A palavra "SUPABASE_SERVICE_ROLE_KEY" está no bundle?', data.includes('SUPABASE_SERVICE_ROLE_KEY'));
    console.log('3. VITE_SUPABASE_URL está presente no bundle?', data.includes('xifzjpbkpxislqrowswd.supabase.co'));
    console.log('4. VITE_SUPABASE_ANON_KEY está presente no bundle?', data.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  });
}).on('error', (err) => {
  console.error('Erro ao baixar:', err);
});
