#!/usr/bin/env node
/**
 * Mode-switch test of every ready calculator, headless (see src/dev/modeswitch.ts for what is checked).
 *   npm run dev                       (in another terminal; the harness needs the dev server)
 *   node scripts/modeswitch.mjs [--base http://localhost:5173/] [--budget 60] [--workers 4] [--only id,id] [--out modeswitch-report.json]
 * Prints a summary and writes every flag with the trail that reproduces it.
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const base = arg('base', 'http://localhost:5173/');
const budgetMs = Number(arg('budget', 60)) * 1000;
const workers = Number(arg('workers', 4));
const only = arg('only', '')?.split(',').filter(Boolean);
const out = arg('out', 'modeswitch-report.json');

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const first = await browser.newPage();
await first.goto(base, { waitUntil: 'networkidle0' });
const ids = (await first.evaluate(() => window.eeCalc.listCalculators({ status: 'ready' })))
  .flatMap((c) => c.calculators.map((x) => x.id))
  .filter((id) => !only.length || only.some((o) => id.includes(o)));
await first.close();
console.log(`${ids.length} calculators, ${budgetMs / 1000} s each, ${workers} workers`);

const results = [];
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)));
    await page.evaluateOnNewDocument(() => localStorage.clear());
    await page.goto(`${base}#/${id}`, { waitUntil: 'networkidle0' });
    let r;
    try {
      r = await page.evaluate(async (id, budgetMs) => {
        const m = await import('/src/dev/modeswitch.ts');
        return m.runCalc(id, { budgetMs });
      }, id, budgetMs);
    } catch (e) {
      r = { id, actions: 0, states: 0, ms: 0, flags: [{ kind: 'harness-crash', severity: 'high', detail: String(e.message ?? e).slice(0, 400), trail: [] }], samples: [] };
    }
    // console errors the app logs on purpose for a thrown compute are already flagged as red errors
    const errs = [...new Set(consoleErrors.filter((t) => !/^Error: |^\w*Error: /.test(t)))];
    if (errs.length) r.flags.unshift({ kind: 'console-error', severity: 'high', detail: errs.slice(0, 5).join(' | '), trail: [], count: errs.length });
    results.push(r);
    const hi = r.flags.filter((f) => f.severity === 'high').length;
    const med = r.flags.filter((f) => f.severity === 'medium').length;
    console.log(`${id.padEnd(48)} ${String(r.actions).padStart(5)} actions  high ${hi}  medium ${med}  low ${r.flags.length - hi - med}`);
    await page.close();
  }
}
await Promise.all(Array.from({ length: workers }, worker));
await browser.close();
results.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(out, JSON.stringify(results, null, 1));
const tot = results.reduce((n, r) => n + r.actions, 0);
console.log(`\n${tot} actions in total. Report: ${out}`);
