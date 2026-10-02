import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://envase-pro.vercel.app/');
  await page.click('text=Fazer Login no Sistema');
  await page.click('text=Operações (Fábrica)');
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForSelector('text=Quem é você hoje?');
  await page.locator('text=Lucas Araujo').first().click({ force: true });
  await page.waitForTimeout(2000);

  const progId = '00000000-6ab5-0209-5172-d9b59e996fbd';
  await page.goto('https://envase-pro.vercel.app/ExecutarCheckout?id=' + progId);
  await page.waitForSelector('text=PV-28.913', { timeout: 15000 });

  const card = page.locator('div.border-slate-200').filter({ hasText: 'PV-28.913' }).first();
  const buttons = await card.locator('button').allInnerTexts();
  console.log('Botões no card PV-28.913:', buttons);

  await browser.close();
})();
