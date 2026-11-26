/**
 * Mode-switch harness (dev only, never imported by the app, so never bundled).
 *
 * Drives the open calculator's real UI the way a user would — examples, setting dropdowns, unit
 * dropdowns, number edits, ◎ solve buttons, toggles, list add/remove — and inspects every state it
 * lands in for the glitches a mode switch can cause:
 *   - a red error appearing after a switch from a working state
 *   - an input box that does not show the value in the state (wrong unit scale, stale solved value)
 *   - a solved value shown unreadably (0.00063 kHz) or outside its input's limits
 *   - NaN / undefined / Infinity / [object …] text anywhere on the page
 *   - results that change on a unit change (units are display only)
 *   - unstable solves (recomputing the same state gives different answers)
 *   - round-trip failures (solving for Y from a consistent state does not give back Y's value)
 *   - diagram labels that overlap each other or fall outside the drawing, NaN in the SVG
 *   - empty or non-finite graphs, console errors
 *
 * Run headless for every calculator by scripts/modeswitch.mjs (npm run modeswitch), or in a
 * browser tab on the dev server:
 *   const m = await import('/src/dev/modeswitch.ts');
 *   await m.runCalc('general/555-timer', { budgetMs: 30000 });
 *   await m.replay('general/555-timer', ['example: Monostable…', 'select Mode = astable']);
 */

import { findField } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { NumberField } from '@/core/form/form';
import { parseEng } from '@/core/units';

type Kind = 'example' | 'reset' | 'select' | 'unit' | 'toggle' | 'solve' | 'number' | 'list' | 'button';
export interface Action {
  kind: Kind;
  /** Stable description, also the replay key: "select Mode = astable", "solve R_A", "number Supply voltage ×10" */
  label: string;
  run: () => void;
}
export interface Flag {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
  trail: string[];
  state?: Record<string, unknown>;
  count?: number;
}
export interface CalcResult {
  id: string;
  actions: number;
  states: number;
  ms: number;
  flags: Flag[];
  /** A few (state → results) samples from after switches, for independent factual checks */
  samples: { trail: string[]; state: Record<string, unknown>; results: Record<string, number | string | null> }[];
}

const shell = () => (window as any).__eeShell;
const ctl = () => shell().controller;
const inputsHost = () => ctl().slots.inputs as HTMLElement;
const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0;
// relative difference, with an absolute floor so 1e-15 against 0 (round-off at zero) is not a mismatch
const rel = (a: number, b: number) => (Math.abs(a - b) < 1e-12 ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300));


/** Yield to the event loop without a timer (hidden tabs throttle timers to about one per minute). */
const yieldTask = () => new Promise<void>((r) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => r();
  ch.port2.postMessage(0);
});

async function act(a: Action): Promise<void> {
  a.run();
  // compute now rather than waiting for the page's debounce; the debounced run that follows sees
  // the same state and gives the same report
  ctl().run();
  await yieldTask();
  openSections();
}

function openSections(): void {
  for (const d of inputsHost().querySelectorAll('details')) (d as HTMLDetailsElement).open = true;
}

function rowLabel(el: Element): string {
  const row = el.closest('.f-row, .f-item, .f-list');
  const lab = row?.querySelector('.f-label')?.getAttribute('title') ?? row?.querySelector('.f-label')?.textContent ?? '';
  return lab.trim() || (el as HTMLElement).getAttribute('aria-label') || '?';
}

/** Label + occurrence index, so the same label inside list items stays distinct. */
function labeled<E extends Element>(els: E[], name: (el: E) => string): [E, string][] {
  const seen = new Map<string, number>();
  return els.map((el) => {
    const n = name(el);
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    return [el, k ? `${n} #${k + 1}` : n];
  });
}

function fieldOf(key: string): NumberField | null {
  const f = findField(ctl().def.fields, key)?.field;
  return f && f.kind === 'number' ? (f as NumberField) : null;
}

/** Every action available in the current UI state. */
export function enumerate(o: { numbers?: 'edges' | 'random' | 'none'; exact?: { name: string; value: number } } = {}): Action[] {
  openSections();
  const host = inputsHost();
  const out: Action[] = [];
  const tb = ctl().slots.inputsToolbar as HTMLElement;
  const ex = tb.querySelector<HTMLSelectElement>('select.toolbar-select');
  if (ex)
    for (const opt of [...ex.options].filter((x) => x.value))
      out.push({ kind: 'example', label: `example: ${opt.textContent}`, run: () => { ex.value = opt.value; ex.dispatchEvent(new Event('change')); } });
  out.push({ kind: 'reset', label: 'reset', run: () => ctl().replaceState(JSON.parse(JSON.stringify(ctl().def.defaults()))) });

  const sels = [...host.querySelectorAll<HTMLSelectElement>('select.f-select:not(.f-unit-select)')].filter((s) => visible(s) && !s.disabled);
  for (const [s, name] of labeled(sels, rowLabel))
    for (const opt of [...s.options].filter((x) => x.value !== s.value))
      out.push({ kind: 'select', label: `select ${name} = ${opt.value}`, run: () => { s.value = opt.value; s.dispatchEvent(new Event('change')); } });

  const units = [...host.querySelectorAll<HTMLSelectElement>('select.f-unit-select')].filter((s) => visible(s) && !s.disabled);
  for (const [s, name] of labeled(units, rowLabel))
    for (const opt of [...s.options].filter((x) => x.value !== s.value))
      out.push({ kind: 'unit', label: `unit ${name} = ${opt.value}`, run: () => { s.value = opt.value; s.dispatchEvent(new Event('change')); } });

  const toggles = [...host.querySelectorAll<HTMLButtonElement>('.seg-btn:not(.active)')].filter((b) => visible(b) && !b.disabled);
  for (const [b, name] of labeled(toggles, rowLabel)) out.push({ kind: 'toggle', label: `toggle ${name} = ${b.textContent}`, run: () => b.click() });

  const solves = [...host.querySelectorAll<HTMLButtonElement>('button.f-solve-btn')].filter(visible);
  for (const [b, name] of labeled(solves, rowLabel)) out.push({ kind: 'solve', label: `${b.classList.contains('active') ? 'unsolve' : 'solve'} ${name}`, run: () => b.click() });

  const lists = [...host.querySelectorAll<HTMLButtonElement>('.btn-add, .f-item-actions .icon-btn, .f-row-button button')].filter((b) => visible(b) && !b.disabled);
  for (const [b, name] of labeled(lists, (b) => `${b.textContent?.trim()} ${rowLabel(b)}`)) out.push({ kind: b.closest('.f-row-button') ? 'button' : 'list', label: `click ${name}`, run: () => b.click() });

  if (o.numbers !== 'none') {
    const nums = [...host.querySelectorAll<HTMLInputElement>('.f-row-num:not(.solved) input.f-input')].filter((i) => visible(i) && !i.disabled && !i.readOnly);
    for (const [inp, name] of labeled(nums, rowLabel)) {
      const f = fieldOf(inp.dataset.key ?? '');
      const cur = parseEng(inp.value, f?.unit && !f.units ? f.unit : '');
      const lo = f?.min ?? -Infinity;
      const hi = f?.max ?? Infinity;
      // SI → display scale, taken from the box itself (works for nested list fields too)
      const stateVal = stateValue(inp);
      const st = ctl().state;
      const uk = f?.units ? f.unitKey ?? `${f.key}Unit` : '';
      const scale = f?.units && inp.dataset.key! in st && f.units[st[uk]] ? f.units[st[uk]] : f?.unit && !f.units ? 1 : Number.isFinite(cur) && cur !== 0 && typeof stateVal === 'number' && stateVal !== 0 ? stateVal / cur : 1;
      const type = (si: number) => () => {
        inp.value = String(+(si / scale).toPrecision(6));
        inp.dispatchEvent(new Event('input'));
        inp.dispatchEvent(new Event('blur'));
      };
      const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
      const base = typeof stateVal === 'number' && Number.isFinite(stateVal) ? stateVal : NaN;
      const variants: [string, number][] = [];
      if (o.exact) {
        if (o.exact.name === name) variants.push([`= ${o.exact.value}`, o.exact.value]);
      } else if (o.numbers === 'random') {
        const a = Number.isFinite(lo) && lo > 0 ? lo : Math.abs(base || 1) / 100;
        const b = Number.isFinite(hi) ? hi : Math.abs(base || 1) * 100;
        const v = a > 0 && b > a ? Math.exp(Math.log(a) + Math.random() * (Math.log(b) - Math.log(a))) : base * (0.5 + Math.random());
        variants.push([`= ${+clamp(v).toPrecision(6)}`, clamp(+clamp(v).toPrecision(6))]);
      } else {
        if (Number.isFinite(base) && base !== 0) variants.push(['×10', clamp(base * 10)], ['÷10', clamp(base / 10)]);
        if (Number.isFinite(lo) && lo !== base) variants.push(['min', lo]);
        if (Number.isFinite(hi) && hi !== base) variants.push(['max', hi]);
      }
      for (const [tag, v] of variants) if (Number.isFinite(v)) out.push({ kind: 'number', label: `number ${name} ${tag}`, run: type(v) });
    }
  }
  return out;
}

/** The state value behind an input box (top-level keys and list items). */
function stateValue(inp: HTMLInputElement): unknown {
  const key = inp.dataset.key ?? '';
  const st = ctl().state;
  if (key in st) return st[key];
  return undefined;
}

// ───────────────────────────── inspection ─────────────────────────────

interface Snap {
  ok: boolean;
  error?: string;
  solveFor?: string;
  results: Record<string, number>;
  graphCount: number;
  /** red error, or an ok report with a NO SOLUTION status */
  failed: boolean;
}

function snap(r: CalcReport): Snap {
  const results: Record<string, number> = {};
  for (const x of r.results) if (typeof x.value === 'number') results[x.key] = x.value;
  return { ok: r.ok, error: r.error, solveFor: r.solveFor, results, graphCount: r.graphs.length, failed: !r.ok || /NO SOLUTION/i.test(r.status?.text ?? '') };
}

// JS leaking into the page. "undefined"/"null" in prose ("loss is undefined for T = 0") is fine.
const BAD_TEXT = /\bNaN\b|(?<![A-Za-z] )\b(?:undefined|null)\b(?!\)? [a-z])|\[object|Infinity|function\s*\([^)]*\)\s*\{|\)\s*=>|\de[+-]\d{3}/;

function inspect(prev: Snap | null, last: Action | null, deep: boolean): { flags: Omit<Flag, 'trail'>[]; snap: Snap } {
  const c = ctl();
  const r: CalcReport = c.report;
  const s = snap(r);
  const flags: Omit<Flag, 'trail'>[] = [];
  const add = (kind: string, severity: Flag['severity'], detail: string) => flags.push({ kind, severity, detail });
  const switchKinds: Kind[] = ['example', 'reset', 'select', 'unit', 'toggle', 'solve', 'list', 'button'];

  // 1. red errors, and soft failures (ok report, NO SOLUTION status) after a setting switch
  if (r.ok && /NO SOLUTION/i.test(r.status?.text ?? '') && prev && !prev.failed && last && switchKinds.includes(last.kind) && !['reset', 'example'].includes(last.kind))
    add('no-solution-after-switch', 'high', `${r.status?.text}: ${r.warnings[0]?.slice(0, 140) ?? ''}`);
  if (!r.ok) {
    if (!last) add('error-at-start', 'high', r.error ?? '');
    else if (prev?.ok && switchKinds.includes(last.kind)) add('error-after-switch', 'high', r.error ?? '');
    else if (prev?.ok) add('error-after-edit', 'medium', r.error ?? '');
  }

  // 2. bad text anywhere the user reads
  const panes: [string, Element | null][] = [
    ['results', c.resultsPane],
    ['tables', c.tablesPane],
    ['notes', c.notesPane],
    ['graph bar', c.slots.graphBar],
    ['diagram', document.querySelector('.info-pane[data-tab="diagram"]')],
    ['inputs', inputsHost()],
  ];
  for (const [where, el] of panes) {
    if (!el) continue;
    const texts: string[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) texts.push(n.textContent ?? '');
    if (where === 'inputs') texts.push(...[...el.querySelectorAll<HTMLInputElement>('input.f-input')].filter(visible).map((i) => i.value));
    const hit = texts.find((t) => BAD_TEXT.test(t));
    if (hit) {
      const i = hit.search(BAD_TEXT);
      add('bad-text', 'high', `${where}: …${hit.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, ' ')}…`);
    }
  }
  for (const w of r.warnings) if (BAD_TEXT.test(w)) add('bad-text', 'high', `warning: ${w.slice(0, 160)}`);

  // 3. input boxes: shown value = state value, readable, in range
  for (const inp of [...inputsHost().querySelectorAll<HTMLInputElement>('.f-row-num input.f-input')].filter(visible)) {
    const key = inp.dataset.key ?? '';
    if (!(key in c.state)) continue; // list item fields: checked by the calculator's own tests
    const f = fieldOf(key);
    if (!f) continue;
    const solved = !!inp.closest('.f-row.solved');
    const v = c.state[key];
    const name = f.symbol ?? f.label;
    if (v == null) continue;
    if (typeof v !== 'number') {
      add('state-type', 'high', `${name}: state holds ${JSON.stringify(v)}`);
      continue;
    }
    if (!r.ok && solved) continue; // shown as — on purpose
    if (inp.classList.contains('invalid')) continue; // a rejected entry stays visible for the user to fix
    if (['—', '∞', '−∞'].includes(inp.value)) {
      if (!solved) add('display-blank', 'medium', `${name}: input box shows "${inp.value}" but it is an input`);
      continue;
    }
    if (inp.value === '' && !(v === 0 && f.zeroHint)) {
      add('display-blank', 'medium', `${name}: input box is empty, state = ${v}`);
      continue;
    }
    if (inp.value === '') continue;
    const unitKey = f.unitKey ?? `${f.key}Unit`;
    const scale = f.units ? f.units[c.state[unitKey]] ?? NaN : 1;
    const shown = parseEng(inp.value, f.unit && !f.units ? f.unit : '') * scale;
    if (!Number.isFinite(shown) || rel(shown, v) > 2e-3) add('display-mismatch', 'high', `${name}: box shows "${inp.value}"${f.units ? ` ${c.state[unitKey]}` : ''} but the state value is ${v}`);
    const unitSel = inp.closest('.f-control')?.querySelector<HTMLSelectElement>('select.f-unit-select');
    if (f.units && unitSel && unitSel.value !== c.state[unitKey]) add('unit-dropdown-stale', 'high', `${name}: dropdown shows ${unitSel.value}, state unit is ${c.state[unitKey]}`);
    if (f.units && v !== 0) {
      const mant = Math.abs(v / scale);
      if ((mant < 1e-3 || mant >= 1e5) && (solved || (last && last.kind !== 'unit' && switchKinds.includes(last.kind)))) add('unreadable', solved ? 'medium' : 'low', `${name}: shows "${inp.value} ${c.state[unitKey]}"${solved ? ' (solved)' : ''}`);
    }
    if (r.ok && ((f.min != null && v < f.min - 1e-9 * Math.abs(f.min)) || (f.max != null && v > f.max + 1e-9 * Math.abs(f.max)))) add('out-of-range', 'high', `${name} = ${v} outside [${f.min}, ${f.max}]`);
  }

  // 4. a solve-for calculator should show its unknown
  if (c.def.solve && r.ok && !inputsHost().querySelector('.f-row.solved:not([hidden])')) {
    const anyVisibleSolved = [...inputsHost().querySelectorAll('.f-row.solved')].some(visible);
    if (!anyVisibleSolved) add('no-visible-unknown', 'medium', `solveFor = ${c.state.solveFor} but no solved box is visible`);
  }

  // 5. unit changes are display only
  if (prev && last?.kind === 'unit' && prev.ok && r.ok) {
    for (const [k, v] of Object.entries(s.results)) if (k in prev.results && rel(v, prev.results[k]) > 1e-9) add('unit-changed-result', 'high', `${k}: ${prev.results[k]} → ${v} after ${last.label}`);
  }

  // 6. huge jumps after a pure setting switch (review: may be legitimate)
  if (prev && last && ['select', 'toggle', 'solve'].includes(last.kind) && prev.ok && r.ok && prev.solveFor === s.solveFor) {
    for (const [k, v] of Object.entries(s.results)) {
      const p = prev.results[k];
      if (p == null || p === 0 || v === 0 || !Number.isFinite(p) || !Number.isFinite(v)) continue;
      const ratio = Math.abs(v / p);
      if (ratio > 1e3 || ratio < 1e-3) add('big-jump', 'low', `${k}: ${p} → ${v} after ${last.label}`);
    }
  }

  // 7. graphs
  if (r.ok) {
    for (const g of r.graphs) {
      if (g.kind === 'smith' || !g.series) continue;
      const pts = g.series.reduce((n, x) => n + x.y.length, 0);
      if (!pts) add('empty-graph', 'medium', `${g.title}: no points`);
      const bad = g.series.reduce((n, x) => n + x.y.filter((y) => y != null && !Number.isFinite(y)).length, 0);
      if (pts && bad / pts > 0.5) add('graph-nonfinite', 'medium', `${g.title}: ${bad}/${pts} points not finite`);
      for (const x of g.series) if (x.x.length !== x.y.length) add('graph-shape', 'high', `${g.title} / ${x.label}: x and y lengths differ`);
    }
    if (prev?.ok && prev.graphCount && !r.graphs.length) add('graphs-vanished', 'low', `graphs disappeared after ${last?.label}`);
  }

  // 8. diagram
  const pane = document.querySelector<HTMLElement>('.info-pane[data-tab="diagram"]');
  const svg = pane?.querySelector('svg');
  if (pane && !pane.hidden && svg) {
    const html = svg.outerHTML;
    const m = html.match(/="[^"]*(NaN|Infinity|undefined)[^"]*"/);
    if (m) add('diagram-nan', 'high', `attribute ${m[0].slice(0, 80)}`);
    const box = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll('text')].filter((t) => (t.textContent ?? '').trim() && getComputedStyle(t).display !== 'none' && getComputedStyle(t).visibility !== 'hidden');
    const rects = texts.map((t) => ({ t: (t.textContent ?? '').trim(), b: t.getBoundingClientRect() }));
    const scroll = !!pane.querySelector('.circuit-scroll');
    for (const x of rects) {
      if (!scroll && (x.b.left < box.left - 2 || x.b.right > box.right + 2 || x.b.top < box.top - 2 || x.b.bottom > box.bottom + 2)) add('diagram-clipped', 'medium', `"${x.t}" extends outside the drawing`);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].b;
        const b = rects[j].b;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const hgt = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w <= 0 || hgt <= 0) continue;
        const frac = (w * hgt) / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
        if (frac > 0.3) add('diagram-overlap', 'medium', `"${rects[i].t}" overlaps "${rects[j].t}" (${Math.round(frac * 100)} %)`);
      }
  }

  if (deep && r.ok) {
    const def = c.def;
    // 9. recomputing the same state must give the same answer
    const again = runCompute(def, structuredClone(c.state));
    if (!again.ok) add('unstable', 'high', `recompute of the same state fails: ${again.error}`);
    else
      for (const x of again.results)
        if (typeof x.value === 'number' && x.key in s.results && Number.isFinite(x.value) && rel(x.value, s.results[x.key]) > 1e-6) add('unstable', 'high', `${x.key}: ${s.results[x.key]} → ${x.value} on recompute`);
    // 10. round trip: from this consistent state, solving for any other unknown gives back its value
    // (a "no solution" state keeps its last answer in the state, so it is not consistent: skip it)
    const solvedFinite = r.results.filter((x) => x.solved).every((x) => typeof x.value === 'number' && Number.isFinite(x.value));
    if (def.solve && solvedFinite && !/NO SOLUTION/i.test(r.status?.text ?? '')) {
      for (const o of def.solve.options) {
        if (o.key === c.state.solveFor) continue;
        const st = structuredClone(c.state);
        st.solveFor = o.key;
        let rr: CalcReport;
        try {
          rr = runCompute(def, st);
        } catch (e) {
          add('roundtrip-throw', 'high', `solveFor ${o.key}: ${(e as Error).message}`);
          continue;
        }
        if (!rr.ok) {
          add('roundtrip-error', 'low', `solveFor ${o.key} from here: ${rr.error?.slice(0, 160)}`);
          continue;
        }
        for (const x of rr.results) {
          if (!x.solved || typeof x.value !== 'number' || !(x.key in c.state) || typeof c.state[x.key] !== 'number') continue;
          if (rel(x.value, c.state[x.key]) > 1e-3) add('roundtrip', 'medium', `solveFor ${o.key}: ${x.key} = ${x.value} but the state has ${c.state[x.key]}`);
        }
      }
    }
  }
  return { flags, snap: s };
}

// ───────────────────────────── runner ─────────────────────────────

function signature(f: Omit<Flag, 'trail'>): string {
  return `${f.kind}|${f.detail.replace(/-?\d[\d.e+-]*/g, '#').slice(0, 140)}`;
}

async function startAt(label: string): Promise<void> {
  if (label === 'defaults') {
    ctl().replaceState(JSON.parse(JSON.stringify({ ...ctl().def.defaults() })));
    await yieldTask();
    openSections();
    return;
  }
  const a = enumerate({ numbers: 'none' }).find((x) => x.label === label);
  if (!a) throw new Error(`no start ${label}`);
  await act(a);
}

export async function runCalc(id: string, o: { budgetMs?: number; pairCap?: number; samples?: number } = {}): Promise<CalcResult> {
  const t0 = performance.now();
  const budget = o.budgetMs ?? 60000;
  const pairCap = o.pairCap ?? 400;
  if (shell().currentId !== id) {
    await (window as any).eeCalc.open(id);
    await yieldTask();
  }
  const info = ctl().slots.info;
  if (info.has('diagram')) info.show('diagram');
  const flags = new Map<string, Flag>();
  const samples: CalcResult['samples'] = [];
  let actions = 0;
  let states = 0;
  const record = (fs: Omit<Flag, 'trail'>[], trail: string[]) => {
    for (const f of fs) {
      const k = signature(f);
      const old = flags.get(k);
      if (old) old.count = (old.count ?? 1) + 1;
      else flags.set(k, { ...f, trail: [...trail], state: structuredClone(ctl().state), count: 1 });
    }
  };
  const sample = (trail: string[]) => {
    if (samples.length >= (o.samples ?? 12) || !ctl().report.ok) return;
    const results: Record<string, number | string | null> = {};
    for (const x of ctl().report.results as CalcReport['results']) results[x.key] = typeof x.value === 'number' ? x.value : x.display;
    samples.push({ trail: [...trail], state: structuredClone(ctl().state), results });
  };
  const timeLeft = () => performance.now() - t0 < budget;

  // Phase 1: every action from every start state (defaults and each example)
  await startAt('defaults');
  const starts = ['defaults', ...enumerate({ numbers: 'none' }).filter((a) => a.kind === 'example').map((a) => a.label)];
  for (const start of starts) {
    await startAt(start);
    const base = inspect(null, null, true);
    record(base.flags, [start]);
    states++;
    const labels = enumerate({ numbers: 'edges' }).map((a) => a.label);
    for (const label of labels) {
      if (!timeLeft()) break;
      await startAt(start);
      const before = snap(ctl().report);
      const a = enumerate({ numbers: 'edges' }).find((x) => x.label === label);
      if (!a) continue;
      await act(a);
      actions++;
      states++;
      const r = inspect(before, a, true);
      record(r.flags, [start, label]);
      if (a.kind !== 'number' && Math.random() < 0.15) sample([start, label]);
    }
  }

  // Phase 2: every ordered pair of setting switches from the defaults (sampled above the cap)
  await startAt('defaults');
  const structural = enumerate({ numbers: 'none' }).filter((a) => a.kind !== 'reset');
  // one alternative per unit dropdown keeps pairs focused on mode changes
  const seenUnit = new Set<string>();
  const firsts = structural.filter((a) => {
    if (a.kind !== 'unit') return true;
    const k = a.label.replace(/ = .*/, '');
    if (seenUnit.has(k)) return false;
    seenUnit.add(k);
    return true;
  });
  let pairs: [string, string][] = [];
  for (const a of firsts) for (const b of firsts) if (a !== b) pairs.push([a.label, b.label]);
  if (pairs.length > pairCap) pairs = pairs.sort(() => Math.random() - 0.5).slice(0, pairCap);
  for (const [la, lb] of pairs) {
    if (!timeLeft()) break;
    await startAt('defaults');
    const a = enumerate({ numbers: 'none' }).find((x) => x.label === la);
    if (!a) continue;
    let before = snap(ctl().report);
    await act(a);
    let r = inspect(before, a, false);
    record(r.flags, ['defaults', la]);
    // the second switch may not exist any more (hidden by the first): try its nearest equivalent
    const pool = enumerate({ numbers: 'none' });
    const b = pool.find((x) => x.label === lb) ?? pool.find((x) => x.label.replace(/ = .*/, '') === lb.replace(/ = .*/, '') && x.kind === 'select');
    if (!b) continue;
    before = r.snap;
    await act(b);
    actions += 2;
    states += 2;
    r = inspect(before, b, true);
    record(r.flags, ['defaults', la, b.label]);
    if (Math.random() < 0.05) sample(['defaults', la, b.label]);
  }

  // Phase 3: random walks (settings, units, solve targets, examples and random numbers) until the budget ends
  while (timeLeft()) {
    const start = starts[Math.floor(Math.random() * starts.length)];
    await startAt(start);
    const trail = [start];
    let prev = snap(ctl().report);
    for (let i = 0; i < 12 && timeLeft(); i++) {
      const pool = enumerate({ numbers: Math.random() < 0.3 ? 'random' : 'none' }).filter((a) => a.kind !== 'reset');
      const nonNum = pool.filter((a) => a.kind !== 'number');
      const nums = pool.filter((a) => a.kind === 'number');
      const a = nums.length && Math.random() < 0.3 ? nums[Math.floor(Math.random() * nums.length)] : nonNum[Math.floor(Math.random() * nonNum.length)];
      if (!a) break;
      await act(a);
      trail.push(a.label);
      actions++;
      states++;
      const r = inspect(prev, a, i % 3 === 2);
      record(r.flags, trail);
      prev = r.snap;
      if (Math.random() < 0.03) sample(trail);
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return {
    id,
    actions,
    states,
    ms: Math.round(performance.now() - t0),
    flags: [...flags.values()].sort((a, b) => order[a.severity] - order[b.severity]),
    samples,
  };
}

/** Re-run a recorded trail (start label first) and return the flags of the final state, for reproducing a finding. */
export async function replay(id: string, trail: string[]): Promise<{ flags: Omit<Flag, 'trail'>[]; report: CalcReport; state: Record<string, unknown> }> {
  if (shell().currentId !== id) {
    await (window as any).eeCalc.open(id);
    await yieldTask();
  }
  const info = ctl().slots.info;
  if (info.has('diagram')) info.show('diagram');
  await startAt(trail[0]);
  let prev = snap(ctl().report);
  let r = inspect(null, null, true);
  for (const label of trail.slice(1)) {
    const m = label.match(/^number (.+) = (\S+)$/);
    const a = enumerate(m ? { exact: { name: m[1], value: Number(m[2]) } } : { numbers: 'edges' }).find((x) => x.label === label);
    if (!a) throw new Error(`action not available: ${label}`);
    await act(a);
    r = inspect(prev, a, true);
    prev = r.snap;
  }
  return { flags: r.flags, report: ctl().report, state: structuredClone(ctl().state) };
}

/**
 * Run several calculators one after another in this tab, posting each result to `sink` (a local
 * collector) as it finishes. For when no headless Chrome is available: open the dev server in a
 * browser and call this from the console. Progress is in window.__msProgress.
 */
export async function runAll(ids: string[], o: { budgetMs?: number; sink?: string } = {}): Promise<void> {
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => {
    const t = a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');
    // a compute that throws is logged on purpose and already shows as a red error
    if (!(a[0] instanceof Error)) errors.push(t.slice(0, 300));
    orig(...a);
  };
  const onErr = (e: ErrorEvent) => errors.push(`pageerror: ${e.message}`);
  window.addEventListener('error', onErr);
  const prog = ((window as any).__msProgress = { done: [] as string[], current: '', total: ids.length });
  try {
    for (const id of ids) {
      prog.current = id;
      errors.length = 0;
      let r: CalcResult;
      try {
        r = await runCalc(id, { budgetMs: o.budgetMs });
      } catch (e) {
        r = { id, actions: 0, states: 0, ms: 0, flags: [{ kind: 'harness-crash', severity: 'high', detail: String((e as Error).message ?? e), trail: [] }], samples: [] };
      }
      if (errors.length) r.flags.unshift({ kind: 'console-error', severity: 'high', detail: [...new Set(errors)].slice(0, 5).join(' | '), trail: [], count: errors.length });
      if (o.sink) await fetch(o.sink, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) }).catch(() => undefined);
      prog.done.push(`${id}: ${r.actions} actions, ${r.flags.filter((f) => f.severity === 'high').length} high`);
    }
  } finally {
    console.error = orig;
    window.removeEventListener('error', onErr);
    prog.current = 'finished';
  }
}
