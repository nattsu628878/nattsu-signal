import { chromium } from 'playwright';
import fs from 'node:fs';

const targets = [
  ['technology-universe', 'https://nattsu628878.github.io/technology-universe/'],
  ['nattsu-explorer', 'https://nattsu628878.github.io/nattsu-explorer/'],
  ['davinci-resolve-guide', 'https://nattsu628878.github.io/davinci-resolve-guide/'],
  ['logic-fx-guide', 'https://nattsu628878.github.io/logic-fx-guide/'],
  ['lut-visualizer', 'https://nattsu628878.github.io/lut-visualizer/'],
  ['model-viewer', 'https://nattsu628878.github.io/model-viewer/'],
  ['pixel-render-gallery', 'https://nattsu628878.github.io/pixel-render-gallery/'],
  ['audio-reactive-visualizer', 'https://nattsu628878.github.io/audio-reactive-visualizer/'],
  ['procedural-soundscape', 'https://nattsu628878.github.io/procedural-soundscape/'],
  ['web-tools', 'https://nattsu628878.github.io/web-tools/'],
  ['web-synth', 'https://nattsu628878.github.io/web-synth/'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

for (const [slug, url] of targets) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `public/opus/${slug}.png` });
    console.log('OK', slug);
  } catch (e) {
    console.log('FAIL', slug, e.message);
  }
}

await browser.close();
