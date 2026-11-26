#!/usr/bin/env node
/**
 * Headless screenshots for remote review (desktop 16:9 + phone).
 *   npm run dev            (in another terminal)
 *   node scripts/screenshots.mjs [baseUrl] [outDir]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const KEY = 'eecalc:power/inrush:state';
const tr = (mm, wmm = 0.5) => ({ length: mm / 1e3, lengthUnit: 'mm', width: wmm / 1e3, widthUnit: 'mm', oz: 1, geometry: 'microstrip', h: 0.2e-3, hUnit: 'mm', er: 4.5, ret: true });
const mlcc = (qty, c, cs, v) => ({ kind: 'ceramic', qty, c, dielectric: 'X5R', caseSize: cs, vRatedC: v, tolPct: 10, eslC: 0, esrC: 0, chemistry: 'Aluminum electrolytic', pkg: 'Radial can', vRatedE: 25, esrE: 0.15, eslE: 0 });
const alu = (qty, c, v, esr) => ({ ...mlcc(qty, c, '0805', v), kind: 'electrolytic', vRatedE: v, esrE: esr });

/** Three groups on different traces — similar to the old app's screenshot. */
const multiGroup = {
  version: 1, v: 25.991, vFail: 30, iLimit: 0, waveform: 'Step (hot-plug)', rise: 50e-9, v0: 0, tempC: 25, rSrc: 0.0001,
  lead: { length: 0.5, lengthUnit: 'mm', spacing: 5e-3, spacingUnit: 'mm', awg: 20, pair: true },
  series: tr(50, 2),
  groups: [
    { trace: tr(10, 7), caps: [mlcc(2, 22e-6, '1206', 35), mlcc(2, 10e-6, '0805', 50)] },
    { trace: tr(50, 3), caps: [mlcc(2, 22e-6, '1206', 35)] },
    { trace: tr(80, 3), caps: [alu(1, 100e-6, 35, 0.15)] },
  ],
  rDamp: 0, rConn: 5e-3, lExtra: 0, rExtra: 0,
};

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });

async function shot(name, { width, height, dpr = 1, mobile = false, hash = '#/power/inrush', state = null, infoTab = null, prep = null, fullPage = false, scrollTo = null }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument((key, st, tab) => {
    localStorage.clear();
    if (st) localStorage.setItem(key, JSON.stringify(st));
    if (tab) localStorage.setItem('eecalc:power/inrush:infotab', JSON.stringify(tab));
  }, KEY, state, infoTab);
  page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
  await page.goto(base + hash, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  if (prep) await prep(page);
  if (scrollTo) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const hdr = (document.querySelector('.app-header')?.offsetHeight ?? 0);
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - hdr - 6);
    }, scrollTo);
    await new Promise((r) => setTimeout(r, 300));
  }
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, fullPage });
  console.log('saved', path);
  await page.close();
}

const D = { width: 1920, height: 1080 };
const P = { width: 390, height: 844, dpr: 3, mobile: true };

await shot('01-desktop-inrush', { ...D });
await shot('02-desktop-3-groups', { ...D, state: multiGroup, infoTab: 'breakdown' });
await shot('03-desktop-3-groups-circuit', { ...D, state: multiGroup, infoTab: 'circuit' });
await shot('04-desktop-theory', { ...D, scrollTo: '.theory' });
await shot('05-desktop-planned-filters', { ...D, hash: '#/filters/sallen-key-lp' });
await shot('06-desktop-finder', { ...D, prep: async (p) => { await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await p.type('.finder-input', 'pcb'); await new Promise((r) => setTimeout(r, 200)); } });
await shot('07-phone-top', { ...P });
await shot('08-phone-inputs', { ...P, scrollTo: '.pane-inputs' });
await shot('09-phone-circuit', { ...P, state: multiGroup, scrollTo: '.pane-info' });
await shot('10-phone-theory', { ...P, scrollTo: '.theory' });
await shot('11-phone-full-page', { ...P, dpr: 2, fullPage: true });

await browser.close();
