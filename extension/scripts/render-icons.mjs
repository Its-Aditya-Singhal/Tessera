// Renders public/icon/icon.svg to the PNG sizes Chrome wants. Run: node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/icon/', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`,
  );
  await page.screenshot({ path: `${dir}${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
