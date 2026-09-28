import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('--- Testando Arquivamento e Visualização de Nota Fiscal ---');
  
  // 1. Cria arquivo temporário de NF para teste
  const testFilePath = path.resolve('scratch/nf_teste_legal.png');
  if (!fs.existsSync('scratch')) fs.mkdirSync('scratch', { recursive: true });
  // Um png válido de 1x1 ou 100x100
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzk4lqZAAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(testFilePath, pngBuffer);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const appUrl = 'https://envase-pro.vercel.app';
  console.log(`Navegando para ${appUrl}...`);
  await page.goto(appUrl, { waitUntil: 'networkidle' });

  // Autenticação
  console.log('Realizando login como PCP/Admin...');
  await page.waitForSelector('text=Fazer Login no Sistema', { timeout: 15000 });
  await page.click('text=Fazer Login no Sistema');
  await page.waitForSelector('text=Acesso ao EnvasePro');

  // Preenche credenciais
  await page.fill('input#email', 'pcp-brasil@interlub.com');
  await page.fill('input#password', 'Interlub@Pcp2026!');
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);

  // Navega para /NovaNotaFiscal
  console.log('Navegando para /NovaNotaFiscal...');
  await page.goto(`${appUrl}/NovaNotaFiscal`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Upload do arquivo
  console.log('Fazendo upload do arquivo de NF...');
  const fileInput = await page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(testFilePath);
  await page.waitForTimeout(1000);

  // Preenche o número da NF
  const numInput = await page.locator('input[placeholder="Ex: 123456"]').first();
  await numInput.fill('NF-998877');
  await page.waitForTimeout(500);

  // Clica em Salvar
  console.log('Salvando NF...');
  await page.click('button:has-text("Salvar ")');
  await page.waitForTimeout(3000);

  // 2. Consulta banco diretamente para verificar O QUE foi salvo na coluna arquivo_url
  console.log('Consultando registro criado em nota_fiscal_arquivos...');
  const { data: nfs, error } = await supabase
    .from('nota_fiscal_arquivos')
    .select('*')
    .eq('numero_nf', 'NF-998877')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !nfs || nfs.length === 0) {
    console.error('Erro ao buscar NF no banco:', error);
    await browser.close();
    process.exit(1);
  }

  const nfCriada = nfs[0];
  console.log('✅ NF Criada no banco com sucesso:');
  console.log(`- ID: ${nfCriada.id}`);
  console.log(`- Protocolo: ${nfCriada.protocolo_arquivo}`);
  console.log(`- Número NF: ${nfCriada.numero_nf}`);
  console.log(`- Coluna arquivo_url: "${nfCriada.arquivo_url}"`);
  console.log(`- Coluna arquivo_nome: "${nfCriada.arquivo_nome}"`);
  console.log(`- Data Expiração Legal (5 anos): ${nfCriada.data_expiracao_legal}`);

  const isOnlyPath = !nfCriada.arquivo_url.startsWith('http');
  console.log(`👉 arquivo_url é APENAS o caminho no bucket? ${isOnlyPath ? 'SIM (CORRETO)' : 'NÃO (ALERTA: ainda é URL)'}`);

  // 3. Testa abrir a NF no navegador em /NotaFiscalDetalhe
  console.log(`Navegando para /NotaFiscalDetalhe?id=${nfCriada.id}...`);
  await page.goto(`${appUrl}/NotaFiscalDetalhe?id=${nfCriada.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Tira screenshot da tela de detalhe com a URL assinada gerada em tempo de execução
  const screenshotPath = 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c/staging-09-nf-detalhe-signed-url.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot salva em ${screenshotPath}`);

  // Verifica se a imagem renderizada tem src com URL assinada do Supabase
  const imgElement = await page.locator('img[alt="NF"]');
  const imgSrc = await imgElement.getAttribute('src');
  console.log('SRC da imagem renderizada na página:', imgSrc?.slice(0, 80) + '...');
  const hasToken = imgSrc?.includes('token=');
  console.log(`👉 A imagem está usando URL assinada com token temporário? ${hasToken ? 'SIM (CORRETO)' : 'NÃO'}`);

  await browser.close();
}

run().catch(err => {
  console.error('Falha no teste:', err);
  process.exit(1);
});
