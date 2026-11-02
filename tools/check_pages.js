// Smoke-test every page at desktop and phone size.
//
//   python3 -m http.server 8765          (run from the repo root, leave it running)
//   npm install && npx playwright install chromium   (once, in this folder)
//   npm run check                        (or: node check_pages.js)
//
// Reports console errors and horizontal overflow per page, and checks that
// contact.html prefills from ?type= and ?colour=. Pass --shots to also save
// full-page screenshots to tools/screenshots/.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8765';
const PAGES = ['index', 'services', 'work', 'colours', 'about', 'contact'];
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, 'screenshots');

(async () => {
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  let failed = false;
  for (const [tag, width, height, mobile] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    for (const name of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const query = name === 'contact' ? '?type=Exterior&colour=Ojibway%20Sage' : '';
      let res;
      try {
        res = await page.goto(`${BASE}/${name}.html${query}`, { waitUntil: 'load' });
      } catch (e) {
        console.error(`Could not load ${BASE}/${name}.html (${e.message.split('\n')[0]}).`);
        console.error('Is the server running? From the repo root: python3 -m http.server 8765');
        process.exit(2);
      }
      await page.waitForTimeout(1500);
      // scroll through so scroll-triggered reveals run before measuring
      const total = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < total; y += height * 0.6) {
        await page.evaluate(v => window.scrollTo(0, v), y);
        await page.waitForTimeout(150);
      }
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        checked: [...document.querySelectorAll('input[name=type]:checked')].map(x => x.value),
        details: (document.querySelector('textarea[name=details]') || {}).value || '',
      }));
      const problems = [];
      if (!res || res.status() !== 200) problems.push(`HTTP ${res ? res.status() : 'no response'}`);
      if (errors.length) problems.push(`errors: ${errors.join(' | ')}`);
      if (info.overflow > 0) problems.push(`horizontal overflow ${info.overflow}px`);
      if (name === 'contact' && (!info.checked.includes('Exterior') || !info.details.includes('Ojibway Sage'))) problems.push('form prefill failed');
      if (SHOTS) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-${name}.png`), fullPage: true });
      }
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${tag.padEnd(7)} ${name}${problems.length ? `  ${problems.join('; ')}` : ''}`);
      if (problems.length) failed = true;
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
