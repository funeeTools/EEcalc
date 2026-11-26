/**
 * AI control API.
 *
 * A static GitHub Pages site cannot run a normal MCP server, so the page itself is the tool
 * provider, exposed three ways over one implementation:
 *
 *  1. window.eeCalc            — plain JS object. Any agent that can run JS in the page
 *                                  (Playwright, Puppeteer, Claude in Chrome, DevTools) uses it.
 *  2. WebMCP                     — the same functions registered as tools with
 *                                  document.modelContext.registerTool (Chrome's WebMCP API;
 *                                  navigator.modelContext on older previews) when available.
 *  3. URL hash inputs            — #/rf/microstrip-impedance?W=0.3mm&solveFor=W for agents that can
 *                                  only open links. Results are mirrored to
 *                                  <script id="ee-report" type="application/json">.
 *
 * Every call works headlessly: calculators are pure (CalcDef.compute), so an agent can compute
 * any calculator without opening it. Calls that target the open calculator update the page too.
 */

import { applyDefValues, describeFields } from '@/core/calc/fields';
import { type CalcModule, freshDefaults, graphToCsv, loadSavedState, normalizeState, runCompute, stateKeyFor } from '@/core/calc/page';
import type { CalcReport, GraphSpec } from '@/core/calc/types';
import { storage } from '@/core/ui/dom';
import { ALL_CALCS, CATEGORIES, lookupCalc } from './registry';
import type { Shell } from './shell';
import { API_VERSION, APP_VERSION } from './version';

const modCache = new Map<string, CalcModule>();

async function moduleFor(id: string): Promise<{ id: string; title: string; mod: CalcModule }> {
  const hit = lookupCalc(id);
  if (!hit) throw new Error(`Unknown calculator "${id}". Call listCalculators() for ids.`);
  if (!hit.calc.load) throw new Error(`Calculator "${hit.calc.id}" is planned but not built yet.`);
  let mod = modCache.get(hit.calc.id);
  if (!mod) {
    mod = (await hit.calc.load()).default;
    modCache.set(hit.calc.id, mod);
  }
  return { id: hit.calc.id, title: hit.calc.title, mod };
}

/** Thin long arrays so a report stays small enough for an LLM context. */
function decimate(g: GraphSpec, maxPoints: number): GraphSpec {
  if (!g.series || maxPoints <= 0) return g;
  return {
    ...g,
    series: g.series.map((s) => {
      if (s.x.length <= maxPoints) return s;
      const step = (s.x.length - 1) / (maxPoints - 1);
      const idx = Array.from({ length: maxPoints }, (_, i) => Math.round(i * step));
      return { ...s, x: idx.map((i) => s.x[i]), y: idx.map((i) => s.y[i]), decimatedFrom: s.x.length } as any;
    }),
  };
}

export interface ReportOptions {
  /** Include graph series arrays (default false: only graph ids/titles) */
  includeGraphs?: boolean;
  /** Max points per series when graphs are included (default 200; 0 = all) */
  maxPoints?: number;
  /** Include `details` (intermediate values) — default true */
  includeDetails?: boolean;
}

function shapeReport(r: CalcReport, state: Record<string, unknown>, o: ReportOptions = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    calc: r.calc,
    ok: r.ok,
    error: r.error,
    status: r.status,
    solveFor: r.solveFor,
    summary: r.summary,
    results: r.results.map(({ key, label, symbol, value, unit, display, solved, group, tone }) => ({ key, label, symbol, value, unit, display, solved: solved || undefined, group, tone: tone || undefined })),
    warnings: r.warnings,
    notes: r.notes,
    tables: r.tables.map(({ id, title, columns, rows }) => ({ id, title, columns, rows })),
    graphs: o.includeGraphs
      ? r.graphs.map((g) => decimate(g, o.maxPoints ?? 200))
      : r.graphs.map((g) => ({ id: g.id, title: g.title, kind: g.kind ?? 'xy', series: (g.series ?? []).map((s) => `${s.label} (${s.x.length} pts)`) })),
    inputs: state,
  };
  if (o.includeDetails !== false && r.details) out.details = r.details;
  return JSON.parse(JSON.stringify(out, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
}

export function createApi(shell: Shell) {
  const openCtl = (id: string) => (shell.controller && shell.controller.calcId === id ? shell.controller : null);

  const api = {
    /** API contract version and site version (SemVer) */
    version: API_VERSION,
    siteVersion: APP_VERSION,

    /** Short usage guide (also at ./ai.html and ./llms.txt). */
    help(): string {
      return [
        'EEcalc AI API — all values SI unless a string with units is given ("10 mil", "2.4 GHz", "4k7").',
        'listCalculators({status?:"ready"|"planned", category?}) → ids like "rf/microstrip-impedance".',
        'describe(id) → inputs (paths, units, limits, options), solve-for options, graphs, examples.',
        'compute(id, values?, {base:"current"|"defaults", solveFor?, includeGraphs?, maxPoints?}) → report, headless, page untouched.',
        'setInputs(id, values, {open?, includeGraphs?}) → updates saved inputs (and the page if open), returns report.',
        'getResults(id?, opts) → report for the open or saved state. getGraphData(id, graphId?, {maxPoints?, format:"json"|"csv"}).',
        'open(id, {graph?, view?:"diagram"|"graph", tab?}) navigates the UI. reset(id). current() → open calculator. loadExample(id, exampleId).',
        'Solve-for-X: values {solveFor:"W", Z0:50} makes W the unknown and Z0 a target input.',
      ].join('\n');
    },

    listCalculators(o: { status?: 'ready' | 'planned'; category?: string } = {}) {
      return CATEGORIES.filter((c) => !o.category || c.id === o.category || c.title.toLowerCase() === o.category.toLowerCase()).map((c) => ({
        category: c.id,
        title: c.title,
        calculators: c.calcs
          .filter((x) => !o.status || (o.status === 'ready') === !!x.load)
          .map((x) => ({ id: x.id, title: x.title, status: x.load ? 'ready' : 'planned', blurb: x.blurb || undefined })),
      })).filter((c) => c.calculators.length);
    },

    current() {
      return { id: shell.currentId, ready: !!shell.controller, view: shell.controller?.currentView, url: location.href };
    },

    async describe(id: string) {
      const { id: cid, title, mod } = await moduleFor(id);
      const state = openCtl(cid)?.state ?? loadSavedState(mod.def, cid);
      const report = runCompute(mod.def, structuredClone(state));
      const entry = ALL_CALCS.find((x) => x.calc.id === cid)!;
      return {
        id: cid,
        title,
        version: mod.def.version,
        category: entry.cat.title,
        blurb: entry.calc.blurb,
        method: mod.def.method,
        solve: mod.def.solve ? { options: mod.def.solve.options, current: state.solveFor, how: 'Pass {solveFor: key} with the other values; the solved key becomes an output.' } : undefined,
        inputs: describeFields(mod.def.fields, state),
        outputs: report.results.map(({ key, label, symbol, unit, group }) => ({ key, label, symbol, unit, group })),
        graphs: report.graphs.map((g) => ({ id: g.id, title: g.title, kind: g.kind ?? 'xy', x: g.x, y: g.y, series: (g.series ?? []).map((s) => s.label) })),
        tables: report.tables.map((t) => ({ id: t.id, title: t.title, columns: t.columns })),
        examples: (mod.def.examples ?? []).map((e) => ({ id: e.id, label: e.label })),
        theory: mod.theory?.sections.map((s) => s.title),
      };
    },

    async getState(id?: string) {
      const { id: cid, mod } = await moduleFor(id ?? shell.currentId);
      return structuredClone(openCtl(cid)?.state ?? loadSavedState(mod.def, cid));
    },

    async compute(id: string, values: Record<string, unknown> = {}, o: ReportOptions & { base?: 'current' | 'defaults' } = {}) {
      const { id: cid, mod } = await moduleFor(id);
      const base = o.base === 'defaults' ? mod.def.defaults() : structuredClone(openCtl(cid)?.state ?? loadSavedState(mod.def, cid));
      const state = normalizeState(mod.def, base);
      const errors = applyDefValues(mod.def, state, values);
      const r = runCompute(mod.def, state);
      return { ...shapeReport(r, state, o), inputErrors: errors.length ? errors : undefined };
    },

    async setInputs(id: string, values: Record<string, unknown>, o: ReportOptions & { open?: boolean } = {}) {
      const { id: cid, mod } = await moduleFor(id);
      if (o.open && shell.currentId !== cid) await shell.open(cid);
      const ctl = openCtl(cid);
      let errors: string[];
      let state: Record<string, any>;
      let r: CalcReport;
      if (ctl) {
        errors = ctl.setValues(values);
        state = ctl.state;
        r = ctl.report!;
      } else {
        state = loadSavedState(mod.def, cid);
        errors = applyDefValues(mod.def, state, values);
        r = runCompute(mod.def, state);
        storage.set(stateKeyFor(cid), state);
      }
      return { ...shapeReport(r, structuredClone(state), o), inputErrors: errors.length ? errors : undefined, pageUpdated: !!ctl };
    },

    async getResults(id?: string, o: ReportOptions = {}) {
      const { id: cid, mod } = await moduleFor(id ?? shell.currentId);
      const ctl = openCtl(cid);
      if (ctl?.report) return shapeReport(ctl.report, structuredClone(ctl.state), o);
      const state = loadSavedState(mod.def, cid);
      return shapeReport(runCompute(mod.def, state), state, o);
    },

    async getGraphData(id?: string, graphId?: string, o: { maxPoints?: number; format?: 'json' | 'csv' } = {}) {
      const { id: cid, mod } = await moduleFor(id ?? shell.currentId);
      const ctl = openCtl(cid);
      const r = ctl?.report ?? runCompute(mod.def, loadSavedState(mod.def, cid));
      const gs = graphId ? r.graphs.filter((g) => g.id === graphId) : r.graphs;
      if (!gs.length) throw new Error(`No graph "${graphId}". Available: ${r.graphs.map((g) => g.id).join(', ')}`);
      if (o.format === 'csv') return gs.map((g) => ({ id: g.id, title: g.title, csv: graphToCsv(decimate(g, o.maxPoints ?? 0)) }));
      return gs.map((g) => decimate(g, o.maxPoints ?? 0));
    },

    async open(id: string, o: { graph?: string; view?: 'graph' | 'diagram'; tab?: string } = {}) {
      const { id: cid } = await moduleFor(id).catch(() => ({ id: lookupCalc(id)?.calc.id ?? id }));
      if (!lookupCalc(cid)) throw new Error(`Unknown calculator "${id}"`);
      await shell.open(cid);
      const ctl = shell.controller;
      if (ctl && o.graph) ctl.showGraph(o.graph);
      if (ctl && o.view) ctl.setView(o.view);
      if (ctl && o.tab && ctl.slots.info.has(o.tab)) ctl.slots.info.show(o.tab);
      return api.current();
    },

    async reset(id?: string) {
      const { id: cid, mod } = await moduleFor(id ?? shell.currentId);
      const ctl = openCtl(cid);
      if (ctl) ctl.replaceState(freshDefaults(mod.def));
      else storage.set(stateKeyFor(cid), freshDefaults(mod.def));
      return api.getResults(cid);
    },

    async loadExample(id: string, exampleId: string) {
      const { id: cid, mod } = await moduleFor(id);
      const ex = mod.def.examples?.find((e) => e.id === exampleId);
      if (!ex) throw new Error(`No example "${exampleId}". Available: ${(mod.def.examples ?? []).map((e) => e.id).join(', ')}`);
      const state = normalizeState(mod.def, { ...freshDefaults(mod.def), ...structuredClone(ex.state) });
      const ctl = openCtl(cid);
      if (ctl) ctl.replaceState(state);
      else storage.set(stateKeyFor(cid), state);
      return api.getResults(cid);
    },
  };
  return api;
}

export type EeCalcApi = ReturnType<typeof createApi>;

// ───────────────────────────── WebMCP ─────────────────────────────

const valuesSchema = {
  type: 'object',
  description: 'Input values by path (see describe). Numbers are SI; strings may carry units, e.g. "10 mil", "2.4 GHz", "4k7". Include solveFor to choose the unknown.',
  additionalProperties: true,
};
const idProp = { type: 'string', description: 'Calculator id, e.g. "rf/microstrip-impedance" (see ee_list_calculators)' };

export async function registerWebMcp(api: EeCalcApi): Promise<'document' | 'navigator' | null> {
  const mc: any = (document as any).modelContext ?? (navigator as any).modelContext;
  if (!mc?.registerTool) return null;
  const json = (x: unknown) => JSON.stringify(x);
  const tools = [
    {
      name: 'ee_list_calculators',
      description: 'List EEcalc calculators (ready and planned) grouped by category.',
      inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['ready', 'planned'] }, category: { type: 'string' } } },
      annotations: { readOnlyHint: true },
      execute: async (a: any) => json(api.listCalculators(a ?? {})),
    },
    {
      name: 'ee_describe_calculator',
      description: 'Inputs (paths, SI units, unit choices, limits, options), solve-for options, outputs, graphs and examples of one calculator.',
      inputSchema: { type: 'object', properties: { id: idProp }, required: ['id'] },
      annotations: { readOnlyHint: true },
      execute: async (a: any) => json(await api.describe(a.id)),
    },
    {
      name: 'ee_compute',
      description: 'Compute a calculator headlessly from its saved inputs plus the given values. Does not change the page.',
      inputSchema: {
        type: 'object',
        properties: { id: idProp, values: valuesSchema, base: { type: 'string', enum: ['current', 'defaults'] }, includeGraphs: { type: 'boolean' }, maxPoints: { type: 'number' } },
        required: ['id'],
      },
      annotations: { readOnlyHint: true },
      execute: async (a: any) => json(await api.compute(a.id, a.values ?? {}, a)),
    },
    {
      name: 'ee_set_inputs',
      description: 'Set inputs of a calculator (updates the visible page if it is open) and return the new results.',
      inputSchema: { type: 'object', properties: { id: idProp, values: valuesSchema, open: { type: 'boolean', description: 'Navigate to the calculator first' } }, required: ['id', 'values'] },
      execute: async (a: any) => json(await api.setInputs(a.id, a.values ?? {}, a)),
    },
    {
      name: 'ee_get_results',
      description: 'Results, warnings, tables and underlying details of a calculator (the open one if id is omitted).',
      inputSchema: { type: 'object', properties: { id: idProp, includeGraphs: { type: 'boolean' }, maxPoints: { type: 'number' } } },
      annotations: { readOnlyHint: true },
      execute: async (a: any) => json(await api.getResults(a?.id, a ?? {})),
    },
    {
      name: 'ee_get_graph_data',
      description: 'Full data of a calculator graph (series arrays), as JSON or CSV.',
      inputSchema: { type: 'object', properties: { id: idProp, graphId: { type: 'string' }, maxPoints: { type: 'number' }, format: { type: 'string', enum: ['json', 'csv'] } } },
      annotations: { readOnlyHint: true },
      execute: async (a: any) => json(await api.getGraphData(a?.id, a?.graphId, a ?? {})),
    },
    {
      name: 'ee_open_calculator',
      description: 'Show a calculator in the page (optionally a graph id, the graph pane view "diagram" or "graph", or an info tab id).',
      inputSchema: { type: 'object', properties: { id: idProp, graph: { type: 'string' }, view: { type: 'string', enum: ['diagram', 'graph'] }, tab: { type: 'string' } }, required: ['id'] },
      execute: async (a: any) => json(await api.open(a.id, a)),
    },
    {
      name: 'ee_reset_calculator',
      description: 'Reset a calculator to its default inputs.',
      inputSchema: { type: 'object', properties: { id: idProp } },
      execute: async (a: any) => json(await api.reset(a?.id)),
    },
  ];
  for (const t of tools) {
    try {
      await mc.registerTool(t);
    } catch (e) {
      console.warn('WebMCP registerTool failed', t.name, e);
    }
  }
  return (document as any).modelContext ? 'document' : 'navigator';
}
