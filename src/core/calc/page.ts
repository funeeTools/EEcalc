/**
 * CalcController — runs one calculator on the standard page.
 *
 * form (left) → state → def.compute(state) → CalcReport → graph pane, Results / Tables / Notes tabs.
 * The same controller is what the AI API drives when the calculator is open (setValues,
 * getReport), so the page and the API can never disagree.
 */

import { Form } from '@/core/form/form';
import { Plot, type PlotConfig } from '@/core/plot/plot';
import { SmithChart } from '@/core/plot/smith';
import { buildCalcPage, type CalcSlots } from '@/core/ui/calc-page';
import { h, clear, debounce, storage, symNodes } from '@/core/ui/dom';
import { settings, onSettings } from '@/core/settings';
import { si } from '@/core/units';
import { applyDefValues, applyUnitPrefs, findField, getPath, setPath } from './fields';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TheoryContent, errorReport } from './types';

export interface CalcView {
  /** Add custom tabs / widgets. Return a cleanup function. */
  setup?(ctl: CalcController): void | (() => void);
  /** Called after every compute, after the standard panes are rendered. */
  update?(ctl: CalcController, report: CalcReport): void;
}

/**
 * A drawing of what the calculator models: a schematic, cross-section, block diagram or thermal network.
 * The page shows it large in the graph pane (the default view there; a Diagram | Graph switch flips it)
 * and again in its own tab after Notes, and redraws both after every compute.
 */
export interface DiagramSpec {
  /** Tab label: 'Circuit' (schematics), 'Cross-section' (geometry) or 'Diagram' (block, link, thermal) */
  title: string;
  /**
   * Draw from the current state and report (also called when report.ok is false: draw what the inputs
   * describe, or return null for an empty tab). compact = phone-width layout (≤ 900 px).
   */
  draw(state: any, report: CalcReport, compact: boolean): SVGElement | null;
  /** Wide drawings (long ladders) keep their size and scroll sideways instead of shrinking */
  scroll?: boolean;
}

export interface CalcModule {
  def: CalcDef<any>;
  theory?: TheoryContent;
  /** The calculator's circuit / cross-section / block diagram, shown in its own tab */
  diagram?: DiagramSpec;
  view?: CalcView;
}

const PALETTE = ['#1f4e5f', '#c47b17', '#4f8a8b', '#8b1e1e', '#6b5b95', '#2f7d4f', '#9a8f7a', '#386a77'];

function plotConfigOf(g: GraphSpec): PlotConfig {
  return { x: g.x ?? { label: 'x', unit: '' }, y: g.y ?? [{ id: 'y', label: 'y', unit: '' }], emptyText: 'No data' };
}

function plotDataOf(g: GraphSpec) {
  return {
    series: (g.series ?? []).map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length] })),
    hlines: (g.hlines ?? []).map((l) => ({ ...l, color: l.color ?? '#8b1e1e' })),
    vlines: (g.vlines ?? []).map((l) => ({ ...l, color: l.color ?? '#9a8f7a' })),
    markers: (g.markers ?? []).map((m) => ({ ...m, color: m.color ?? '#1f4e5f' })),
    subtitle: g.subtitle,
    xRange: g.xRange,
    legendBelow: g.legend === 'below',
  };
}

export function stateKeyFor(calcId: string): string {
  return `eecalc:${calcId}:state`;
}

/** Load a calculator's saved state (or defaults) without any UI. */
export function loadSavedState(def: CalcDef<any>, calcId: string): Record<string, any> {
  const raw = settings().remember ? storage.get<unknown>(stateKeyFor(calcId), null) : null;
  return normalizeState(def, raw);
}

/** Default inputs with the user's preferred display units (Settings → Units). */
export function freshDefaults(def: CalcDef<any>): Record<string, any> {
  const d = def.load ? def.load(null) : def.defaults();
  applyUnitPrefs(def.fields, d);
  return d;
}

export function normalizeState(def: CalcDef<any>, raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object') return freshDefaults(def);
  if (def.load) return def.load(raw);
  const d = def.defaults();
  if (!raw || typeof raw !== 'object') return d;
  const merged = { ...d, ...(raw as object) };
  if (def.solve && !def.solve.options.some((o) => o.key === merged.solveFor)) merged.solveFor = def.solve.default;
  return merged;
}

/** Compute + write the solved unknown back into the state (so it shows in its input box). */
export function runCompute(def: CalcDef<any>, state: Record<string, any>): CalcReport {
  const once = (): { report: CalcReport; unitMoved: boolean } => {
    let report: CalcReport;
    try {
      def.sync?.(state);
      report = def.compute(state);
    } catch (err) {
      console.error(err);
      report = errorReport(def.id, err);
    }
    report = guardSolvedRange(def, state, report);
    let unitMoved = false;
    // Write the solved unknown back (its key is a state path, e.g. "w" or "stages.2.nf").
    for (const r of report.results) {
      if (!r.solved || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue; // never write ∞/NaN into an input
      try {
        setPath(state, r.key, r.value);
        unitMoved = fitSolvedUnit(def, state, r.key, r.value) || unitMoved;
      } catch {
        /* result key is not a state path */
      }
    }
    def.sync?.(state);
    return { report, unitMoved };
  };
  const first = once();
  // Result text formatted in the box's unit was written before the unit moved: compute once more.
  return first.unitMoved ? once().report : first.report;
}

const PREFIXES = ['f', 'p', 'n', 'µ', 'u', 'm', 'c', 'k', 'M', 'G', 'T'];

/**
 * A solved value written into a box with a unit dropdown can be unreadable in the unit left over
 * from an earlier mode ("0.00063548 kHz", "0.0009 kΩ"). Switch to the prefixed form of the same
 * unit (mHz, Hz, kHz …) that shows it as 1…9999. Only prefixes of the current unit are candidates,
 * so mm never becomes in and the user's unit system is kept.
 */
function fitSolvedUnit(def: CalcDef<any>, state: Record<string, any>, key: string, value: number): boolean {
  const found = findField(def.fields, key);
  const f = found?.field;
  if (!f || f.kind !== 'number' || !f.units) return false;
  const scope = found!.parentPath ? getPath(state, found!.parentPath) : state;
  if (!scope || typeof scope !== 'object') return false;
  const uk = f.unitKey ?? `${f.key}Unit`;
  if (!f.units[scope[uk]]) return false;
  const best = readableUnit(f.units, scope[uk], value);
  if (best === scope[uk]) return false;
  scope[uk] = best;
  return true;
}

/** The prefixed form of `cur` (same base unit) that shows `value` most readably: 0.1…9999 is kept as is. */
function readableUnit(units: Record<string, number>, cur: string, value: number): string {
  if (value === 0 || !Number.isFinite(value)) return cur;
  const mant = (u: string) => Math.abs(value / units[u]);
  if (mant(cur) >= 0.1 && mant(cur) < 1e4) return cur;
  const base = (u: string) => (u.length > 1 && PREFIXES.includes(u[0]) ? u.slice(1) : u);
  const same = Object.keys(units).filter((u) => base(u) === base(cur));
  const fits = same.filter((u) => mant(u) >= 1 && mant(u) < 1e4).sort((a, b) => units[b] - units[a]);
  return fits[0] ?? same.sort((a, b) => Math.abs(Math.log10(mant(a)) - 1) - Math.abs(Math.log10(mant(b)) - 1))[0] ?? cur;
}

/**
 * Safety net for the style-guide rule "a solved value never lands outside its input's min/max":
 * calculators check this themselves with a specific message; anything they miss becomes an
 * OUT OF RANGE report here instead of an impossible value in an input box.
 */
function guardSolvedRange(def: CalcDef<any>, state: Record<string, any>, report: CalcReport): CalcReport {
  if (!report.ok) return report;
  for (const r of report.results) {
    if (!r.solved || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    const found = findField(def.fields, r.key);
    const f = found?.field;
    if (!f || f.kind !== 'number') continue;
    const tol = 1e-9 * Math.abs(r.value);
    const low = f.min != null && r.value < f.min - tol;
    const high = f.max != null && r.value > f.max + tol;
    if (!low && !high) continue;
    // value and range in the unit the input box shows
    const scope = found!.parentPath ? getPath(state, found!.parentPath) ?? state : state;
    const choice = f.units ? scope[f.unitKey ?? `${f.key}Unit`] ?? f.defaultUnit ?? Object.keys(f.units)[0] : undefined;
    const fmt = (v: number) =>
      f.units && choice && f.units[choice]
        ? ((u) => `${+(v / f.units![u]).toPrecision(4)} ${u}`)(readableUnit(f.units, choice, v))
        : f.unit && Math.abs(v) < 1e15 && Math.abs(v) >= 1e-15
          ? si(v, f.unit, 4)
          : `${+v.toPrecision(4)}${f.unit || f.suffix ? ` ${f.unit ?? f.suffix}` : ''}`;
    const range = `${f.min != null ? fmt(f.min) : '−∞'} … ${f.max != null ? fmt(f.max) : '∞'}`;
    return {
      ...report,
      ok: false,
      error: `The solved ${f.label.charAt(0).toLowerCase() + f.label.slice(1)} (${fmt(r.value)}) is outside the range this input accepts (${range}). Change the other inputs so the answer lands in that range.`,
      status: { text: 'OUT OF RANGE', tone: 'warn' },
      results: report.results.filter((x) => !x.solved),
      // graphs and tables were drawn from the impossible value: do not show them
      graphs: [],
      tables: [],
    };
  }
  return report;
}

export class CalcController {
  readonly slots: CalcSlots;
  readonly def: CalcDef<any>;
  state: Record<string, any>;
  report: CalcReport | null = null;
  private form: Form<any>;
  private plot: Plot | null = null;
  private smith: SmithChart | null = null;
  private sidePlot: Plot | null = null;
  private mainHost: HTMLElement;
  private sideHost: HTMLElement;
  /** The diagram drawn large in the graph pane, shown instead of the graph when view = 'diagram' */
  private diagramHost: HTMLElement;
  /** What the graph pane shows; a page with a diagram opens on it */
  private view: 'graph' | 'diagram' = 'graph';
  private dragRaf = 0;
  /** The pending recompute follows a setting switch (see fallBackToAnalysis) */
  private settingChanged = false;
  private graphId = '';
  private resultsPane: HTMLElement;
  private tablesPane: HTMLElement;
  private notesPane: HTMLElement;
  private cleanups: (() => void)[] = [];
  private persist: () => void;
  readonly schedule: () => void;
  private listeners = new Set<(r: CalcReport) => void>();

  constructor(
    container: HTMLElement,
    readonly calcId: string,
    readonly title: string,
    readonly mod: CalcModule,
    initial?: Record<string, unknown>,
  ) {
    this.def = mod.def;
    this.slots = buildCalcPage(container);
    this.state = loadSavedState(this.def, calcId);
    if (initial && Object.keys(initial).length) {
      const errs = applyDefValues(this.def, this.state, initial);
      if (errs.length) console.warn('URL inputs ignored:', errs);
    }

    this.mainHost = h('div', { class: 'graph-main' });
    this.sideHost = h('div', { class: 'graph-side', hidden: true });
    this.diagramHost = h('div', { class: 'graph-diagram' });
    this.slots.graph.append(this.mainHost, this.sideHost, this.diagramHost);
    this.buildToolbar();

    // Tabs: Results is always first (the main answer view).
    this.resultsPane = this.slots.info.add('results', 'Results');
    this.tablesPane = this.slots.info.add('tables', 'Tables');
    this.notesPane = this.slots.info.add('notes', 'Notes');

    this.persist = debounce(() => this.save(), 300);
    this.schedule = debounce(() => this.run(), 60);
    this.form = new Form(this.slots.inputs, this.def.fields, this.state, (_s, kind) => {
      if (kind === 'setting') this.settingChanged = true;
      this.persist();
      this.schedule();
    });

    if (mod.diagram) this.setupDiagram(mod.diagram);
    const c = mod.view?.setup?.(this);
    if (typeof c === 'function') this.cleanups.push(c);
    this.slots.info.openDefault();

    // KaTeX is large: load the theory renderer on demand, after the calculator is interactive.
    if (mod.theory) {
      const th = mod.theory;
      void import('@/core/ui/theory').then(({ renderTheory }) => renderTheory(this.slots.theory, th.intro, th.sections, this.def.version));
    } else this.slots.theory.parentElement?.setAttribute('hidden', '');

    // Settings → Units changed: show the open calculator in the new units too.
    this.cleanups.push(
      onSettings((s, prev) => {
        if (JSON.stringify(s.units) === JSON.stringify(prev.units) && s.inputDigits === prev.inputDigits) return;
        applyUnitPrefs(this.def.fields, this.state);
        this.form.render();
        this.save();
      }),
    );

    this.run();
    if (initial && Object.keys(initial).length) this.persist();
  }

  private setupDiagram(d: DiagramSpec): void {
    const pane = this.slots.info.add('diagram', d.title);
    this.view = 'diagram';
    const narrow = window.matchMedia('(max-width: 900px)');
    const draw = () => {
      clear(pane);
      clear(this.diagramHost);
      if (!this.report) return;
      let svg: SVGElement | null = null;
      try {
        svg = d.draw(this.state, this.report, narrow.matches);
      } catch (e) {
        console.error('diagram', e);
      }
      // The same picture in both places: the drawings use classes and shared patterns, no ids, so a clone is safe.
      const wrap = (el: SVGElement) => h('div', { class: `circuit-wrap${d.scroll ? ' circuit-scroll' : ''}${narrow.matches ? ' compact' : ''}` }, el);
      const none = () => h('p', { class: 'pane-caption' }, 'Nothing to draw for these inputs.');
      this.diagramHost.append(svg ? wrap(svg.cloneNode(true) as SVGElement) : none());
      pane.append(svg ? wrap(svg) : none());
    };
    this.onReport(draw);
    narrow.addEventListener('change', draw);
    this.cleanups.push(() => narrow.removeEventListener('change', draw));
  }

  private save(): void {
    if (settings().remember) storage.set(stateKeyFor(this.calcId), this.state);
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    cancelAnimationFrame(this.dragRaf);
    this.plot?.destroy();
    this.sidePlot?.destroy();
    this.smith?.destroy();
    this.listeners.clear();
  }

  onReport(fn: (r: CalcReport) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Run the calculation now and redraw everything. */
  run(): CalcReport {
    const prev = this.report;
    let report = runCompute(this.def, this.state);
    if (this.settingChanged) report = this.fallBackToAnalysis(prev, report);
    this.settingChanged = false;
    this.report = report;
    this.form.refresh();
    this.blankUnsolved(report);
    this.render(report);
    for (const fn of this.listeners) fn(report);
    window.dispatchEvent(new CustomEvent('ee:report', { detail: { calcId: this.calcId, report, state: this.state } }));
    return report;
  }

  /**
   * Style guide §5a: a setting switch (dropdown, toggle, list edit) must not turn a working page into
   * a red error. If it makes the current solve impossible, show the analysis of the values already
   * entered instead (when the calculator names one and it works), with a note saying why.
   */
  private fallBackToAnalysis(prev: CalcReport | null, report: CalcReport): CalcReport {
    const solve = this.def.solve;
    const failed = (r: CalcReport) => !r.ok || /NO SOLUTION/i.test(r.status?.text ?? '');
    if (!solve?.analysis || !prev || failed(prev) || !failed(report)) return report;
    const key = typeof solve.analysis === 'function' ? solve.analysis(this.state) : solve.analysis;
    const from = this.state.solveFor;
    if (from === key) return report;
    const trial = structuredClone(this.state);
    trial.solveFor = key;
    if (failed(runCompute(this.def, trial))) return report;
    const why = ((report.ok ? report.warnings[0] ?? report.status?.text : report.error) ?? '').trim().replace(/[.:]$/, '');
    const label = solve.options.find((o) => o.key === from)?.label ?? from;
    this.state.solveFor = key;
    const r = runCompute(this.def, this.state);
    r.warnings.unshift(`Showing the analysis of the values entered: after this change “${label}” has no answer${why ? ` (${why.length > 220 ? `${why.slice(0, 217)}…` : why})` : ''}. Click ◎ to solve for it again.`);
    this.persist();
    return r;
  }

  /**
   * A solved unknown with no finite answer keeps its last value in the state (compute may still need
   * it), but its green box must not show that stale number: show "—" (or ∞) instead.
   */
  private blankUnsolved(report: CalcReport): void {
    // No answer at all: every solved box keeps a value from an earlier calculation, so blank them all.
    if (!report.ok) {
      for (const input of this.slots.inputs.querySelectorAll<HTMLInputElement>('.f-row.solved .f-input')) input.value = '—';
      return;
    }
    for (const r of report.results) {
      if (!r.solved || (typeof r.value === 'number' && Number.isFinite(r.value)) || (r.value !== null && typeof r.value !== 'number')) continue;
      if (r.key.includes('.')) continue;
      const input = this.slots.inputs.querySelector<HTMLInputElement>(`.f-row.solved .f-input[data-key="${CSS.escape(r.key)}"]`);
      if (input) input.value = r.value === Infinity ? '∞' : r.value === -Infinity ? '−∞' : '—';
    }
  }

  /** API: set inputs by path. Returns validation problems (empty = all applied). */
  setValues(values: Record<string, unknown>): string[] {
    const errs = applyDefValues(this.def, this.state, values);
    this.form.render();
    this.save();
    this.run();
    return errs;
  }

  /** API / reset: replace the whole state. */
  replaceState(s: Record<string, any>): void {
    this.state = s;
    this.form.setState(s);
    this.save();
    this.run();
  }

  /** Show a graph by id (also used by the API); switches the graph pane to the graph. */
  showGraph(id: string): boolean {
    if (!this.report?.graphs.some((g) => g.id === id)) return false;
    this.graphId = id;
    this.view = 'graph';
    storage.set(`eecalc:${this.calcId}:graph`, id);
    this.renderGraph(this.report);
    return true;
  }

  /** Show the diagram or the graph in the graph pane (also used by the API). */
  setView(v: 'graph' | 'diagram'): boolean {
    if (v === 'diagram' && !this.mod.diagram) return false;
    this.view = v;
    if (this.report) this.renderGraph(this.report);
    return true;
  }

  get currentView(): 'graph' | 'diagram' {
    return this.mod.diagram && (this.view === 'diagram' || !this.report?.graphs.length) ? 'diagram' : 'graph';
  }

  // ───────────────────────────────── UI ─────────────────────────────────

  private buildToolbar(): void {
    const tb = this.slots.inputsToolbar;
    tb.append(h('span', { class: 'toolbar-title' }, 'Inputs'));
    if (this.def.solve) tb.append(h('span', { class: 'toolbar-hint', title: 'Click ◎ beside a value to make it the unknown' }, '◎ = solve for'));
    else tb.append(h('span', { class: 'toolbar-hint' }, 'Type 4k7, 2.2u, 10n…'));
    if (this.def.examples?.length) {
      const sel = h('select', { class: 'f-select toolbar-select', 'aria-label': 'Load example', title: 'Load a worked example' }, h('option', { value: '' }, 'Examples…'));
      for (const ex of this.def.examples) sel.appendChild(h('option', { value: ex.id }, ex.label));
      sel.addEventListener('change', () => {
        const ex = this.def.examples!.find((e) => e.id === sel.value);
        sel.value = '';
        if (!ex) return;
        this.replaceState(normalizeState(this.def, { ...freshDefaults(this.def), ...structuredClone(ex.state) }));
      });
      tb.append(sel);
    }
    tb.append(
      h('button', {
        class: 'btn btn-ghost btn-small',
        type: 'button',
        title: 'Restore default inputs',
        onclick: () => {
          if (settings().confirmReset && !confirm('Reset all inputs to defaults?')) return;
          this.replaceState(freshDefaults(this.def));
        },
      }, 'Reset'),
      h('span', { class: 'toolbar-version', title: `Calculator version ${this.def.version}` }, `v${this.def.version}`),
    );
  }

  private render(r: CalcReport): void {
    this.renderGraph(r);
    this.renderResults(r);
    this.renderTables(r);
    this.renderNotes(r);
    this.mod.view?.update?.(this, r);
  }

  private renderGraph(r: CalcReport): void {
    const bar = this.slots.graphBar;
    clear(bar);
    // A graph named in another graph's `beside` is drawn next to it and gets no tab of its own.
    const companions = new Set(r.graphs.map((g) => g.beside).filter(Boolean));
    const graphs = r.graphs.filter((g) => !companions.has(g.id));
    const d = this.mod.diagram;
    const showDiagram = !!d && (this.view === 'diagram' || !graphs.length);
    this.slots.graph.classList.toggle('graph-show-diagram', showDiagram);
    // Bar: Diagram | Graph switch on the left (the graph picker sits beside it), the diagram's or lone graph's title centred, CSV on the right.
    const left = h('div', { class: 'graph-bar-left' });
    const mid = h('div', { class: 'graph-bar-mid' });
    const right = h('div', { class: 'graph-bar-right' });
    bar.append(left, mid, right);
    if (d && graphs.length) {
      const sw = h('div', { class: 'graph-tabs view-switch', role: 'tablist', 'aria-label': 'Graph pane shows' });
      for (const [v, label] of [['diagram', 'Diagram'], ['graph', 'Graph']] as const) {
        const on = (v === 'diagram') === showDiagram;
        sw.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(on), class: `graph-tab${on ? ' active' : ''}`, dataset: { view: v }, onclick: () => this.setView(v) }, label));
      }
      left.appendChild(sw);
    }
    if (showDiagram) mid.appendChild(h('span', { class: 'graph-title' }, d!.title));
    if (!graphs.length) {
      this.plot?.setData({ series: [] });
      this.setSide(null);
      bar.hidden = !d;
      return;
    }
    bar.hidden = false;
    if (!graphs.some((g) => g.id === this.graphId)) {
      const saved = storage.get<string>(`eecalc:${this.calcId}:graph`, '');
      this.graphId = graphs.some((g) => g.id === saved) ? saved : graphs[0].id;
    }
    const g = graphs.find((x) => x.id === this.graphId)!;
    const side = g.beside ? r.graphs.find((x) => x.id === g.beside) ?? null : null;
    // The graphs stay drawn (just hidden) under the diagram, so switching back is instant.
    if (!showDiagram) {
      if (graphs.length > 1) {
        const seg = h('div', { class: 'graph-tabs graph-pick', role: 'tablist' });
        for (const x of graphs) {
          seg.appendChild(h('button', { type: 'button', class: `graph-tab${x.id === g.id ? ' active' : ''}`, dataset: { graph: x.id }, onclick: () => this.showGraph(x.id) }, x.title));
        }
        // Beside the Diagram | Graph switch when there is one, else centred as before.
        if (left.childElementCount) {
          left.classList.add('with-pick');
          left.appendChild(seg);
        } else mid.appendChild(seg);
      } else mid.appendChild(h('span', { class: 'graph-title' }, side ? `${g.title} · ${side.title}` : g.title));
    }
    const csvOf = showDiagram ? [] : [g, side].filter((x): x is GraphSpec => !!x && x.kind !== 'smith');
    csvOf.forEach((x) => {
      right.appendChild(
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', title: `Download ${x.title} as CSV`, onclick: () => downloadCsv(x, this.calcId) }, csvOf.length > 1 || side ? `⤓ ${x.title} CSV` : '⤓ CSV'),
      );
    });

    this.setSide(side);
    if (g.kind === 'smith') {
      if (this.plot) {
        this.plot.destroy();
        this.plot = null;
      }
      if (!this.smith) {
        this.smith = new SmithChart(this.mainHost);
        this.smith.onDrag = (dragId, re, im) => this.drag(this.graphId, dragId, re, im);
      }
      if (!this.def.onDrag) this.smith.onDrag = null;
      this.smith.setData({ ...g.smith!, title: g.subtitle });
      return;
    }
    if (this.smith) {
      this.smith.destroy();
      this.smith = null;
    }
    const cfg = plotConfigOf(g);
    if (!this.plot) this.plot = new Plot(this.mainHost, cfg);
    else this.plot.setConfig(cfg);
    this.plot.setData(plotDataOf(g));
  }

  /** Show (or remove) the companion plot beside the main graph. */
  private setSide(g: GraphSpec | null): void {
    this.slots.graph.classList.toggle('graph-paired', !!g);
    this.sideHost.hidden = !g;
    if (!g) {
      this.sidePlot?.destroy();
      this.sidePlot = null;
      return;
    }
    const cfg = plotConfigOf(g);
    if (!this.sidePlot) this.sidePlot = new Plot(this.sideHost, cfg);
    else this.sidePlot.setConfig(cfg);
    this.sidePlot.setData(plotDataOf(g));
  }

  /** A draggable graph point moved: let the calculator update its inputs, then recompute (once per frame). */
  private drag(graphId: string, dragId: string, re: number, im: number): void {
    if (!this.def.onDrag) return;
    this.def.onDrag(this.state, graphId, dragId, { re, im });
    this.persist();
    cancelAnimationFrame(this.dragRaf);
    this.dragRaf = requestAnimationFrame(() => this.run());
  }

  private renderResults(r: CalcReport): void {
    const p = this.resultsPane;
    clear(p);
    if (!r.ok) {
      p.appendChild(h('div', { class: 'result-error' }, h('strong', null, 'Cannot calculate: '), r.error ?? 'invalid input'));
      return;
    }
    const top = h('div', { class: 'results-top' });
    if (r.status) top.appendChild(h('span', { class: `status status-${r.status.tone}` }, r.status.text));
    if (r.summary) top.appendChild(h('span', { class: 'results-summary' }, r.summary));
    if (top.childElementCount) p.appendChild(top);
    if (r.warnings.length) p.appendChild(h('ul', { class: 'notes notes-warn results-warn' }, ...r.warnings.map((w) => h('li', null, w))));

    const primary = r.results.filter((x) => x.primary);
    if (primary.length) p.appendChild(h('div', { class: 'result-cards' }, ...primary.map(resultCard)));

    const rest = r.results.filter((x) => !x.primary);
    if (rest.length) {
      const groups = new Map<string, ResultItem[]>();
      for (const x of rest) {
        const k = x.group ?? 'Details';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(x);
      }
      const grid = h('div', { class: 'breakdown-grid' });
      for (const [title, items] of groups) {
        const tb = h('tbody');
        for (const it of items) {
          tb.appendChild(
            h('tr', { class: `${it.tone ? `tone-${it.tone}` : ''}${it.solved ? ' tone-solved' : ''}`, title: it.note ?? '' },
              h('th', null, it.symbol ? h('span', { class: 'kv-sym' }, ...symNodes(it.symbol)) : null, it.label),
              h('td', null, it.display)),
          );
        }
        grid.appendChild(h('div', { class: 'block' }, h('h4', { class: 'block-title' }, title), h('table', { class: 'kv' }, tb)));
      }
      p.appendChild(grid);
    }
  }

  private renderTables(r: CalcReport): void {
    const p = this.tablesPane;
    clear(p);
    this.slots.info.setVisible('tables', r.tables.length > 0);
    for (const t of r.tables) {
      const table = h('table', { class: 'data-table' });
      table.appendChild(h('thead', null, h('tr', null, ...t.columns.map((c) => h('th', { class: c.align === 'left' ? 'al' : '' }, c.label + (c.unit ? ` (${c.unit})` : ''))))));
      const tb = h('tbody');
      t.rows.forEach((row, i) => {
        const disp = t.display?.[i];
        const tone = t.rowTones?.[i];
        tb.appendChild(h('tr', { class: tone ? `row-${tone}` : '' }, ...t.columns.map((c) => h('td', { class: c.align === 'left' ? 'al' : '' }, disp?.[c.key] ?? fmtCell(row[c.key])))));
      });
      table.appendChild(tb);
      const key = t.rowTones?.some(Boolean)
        ? h('p', { class: 'row-key' }, ...([['pass', 'Works'], ['warn', 'Close to a limit'], ['fail', 'Does not work']] as const).map(([k, label]) => h('span', { class: `row-key-item row-${k}` }, label)))
        : null;
      p.appendChild(h('div', { class: 'block' }, h('h4', { class: 'block-title' }, t.title), h('div', { class: 'table-scroll' }, table), key, t.note ? h('p', { class: 'pane-caption' }, t.note) : null));
    }
  }

  private renderNotes(r: CalcReport): void {
    const p = this.notesPane;
    clear(p);
    if (r.warnings.length) p.appendChild(h('div', { class: 'block' }, h('h4', { class: 'block-title' }, 'Warnings'), h('ul', { class: 'notes notes-warn' }, ...r.warnings.map((w) => h('li', null, w)))));
    if (r.notes.length) p.appendChild(h('div', { class: 'block' }, h('h4', { class: 'block-title' }, 'Model notes & assumptions'), h('ul', { class: 'notes' }, ...r.notes.map((w) => h('li', null, w)))));
    if (this.def.method) p.appendChild(h('div', { class: 'block' }, h('h4', { class: 'block-title' }, 'Method'), h('p', { class: 'pane-caption' }, this.def.method)));
    this.slots.info.setBadge('notes', r.warnings.length ? String(r.warnings.length) : null);
  }
}

function resultCard(x: ResultItem): HTMLElement {
  return h(
    'div',
    { class: `result-card${x.solved ? ' solved' : ''}${x.tone ? ` tone-${x.tone}` : ''}`, dataset: { key: x.key } },
    h('div', { class: 'rc-head' }, x.symbol ? h('span', { class: 'rc-sym' }, ...symNodes(x.symbol)) : null, h('span', { class: 'rc-label' }, x.label), x.solved ? h('span', { class: 'rc-tag' }, 'solved') : null),
    h('div', { class: 'rc-value' }, x.display),
    x.note ? h('div', { class: 'rc-note' }, x.note) : null,
  );
}

function fmtCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toPrecision(5)) : String(v);
  return String(v);
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function graphToCsv(g: GraphSpec): string {
  const series = g.series ?? [];
  if (!series.length) return '';
  const xl = g.x?.unit ? `${g.x.label} (${g.x.unit})` : g.x?.label ?? 'x';
  const sameX = series.every((s) => s.x.length === series[0].x.length && s.x.every((v, i) => v === series[0].x[i]));
  const lines: string[] = [];
  if (sameX) {
    lines.push([xl, ...series.map((s) => s.label)].map(csvEscape).join(','));
    series[0].x.forEach((x, i) => lines.push([x, ...series.map((s) => s.y[i])].join(',')));
  } else {
    lines.push(['series', xl, 'y'].join(','));
    for (const s of series) s.x.forEach((x, i) => lines.push([csvEscape(s.label), x, s.y[i]].join(',')));
  }
  return lines.join('\n');
}

function downloadCsv(g: GraphSpec, calcId: string): void {
  const blob = new Blob([graphToCsv(g)], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${calcId.replace(/\//g, '_')}_${g.id}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
