import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testGerenciar() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://envase-pro.vercel.app/');
  await page.click('text=Fazer Login no Sistema');
  await page.fill('input#email', 'pcp-brasil@interlub.com');
  await page.fill('input#password', 'Interlub@Pcp2026!');
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);
  await page.goto('https://envase-pro.vercel.app/GerenciarUsuarios');
  await page.waitForTimeout(4000);
  const text = await page.textContent('body');
  console.log('Tem tv-fabrica?', text.includes('tv-fabrica@interlub.com'));
  console.log('Tem operacoes.equipe?', text.includes('operacoes.equipe@interlub.com'));
  console.log('HTML snippet:', (await page.locator('div.divide-y').innerHTML().catch(() => 'nao achou divide-y')));
  await browser.close();
}

testGerenciar().catch(console.error);
