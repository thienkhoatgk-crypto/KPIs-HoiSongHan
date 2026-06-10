import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    await page.goto('https://kpissonghan.web.app', { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait an additional 3 seconds to let React run
    await new Promise(r => setTimeout(r, 3000));
  } catch (err) {
    console.log('GOTO ERROR:', err.message);
  }
  
  await browser.close();
})();
