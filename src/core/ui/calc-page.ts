/**
 * The standard calculator page:
 *
 *   ┌────────────┬────────────────────────────────────┐
 *   │ title  vX  │ Diagram|Graph · graph tabs · CSV    │
 *   ├────────────┤ diagram (default) or graph         │   ← fills one screen
 *   │  inputs    │                                    │
 *   │ (scrolls)  ├────────────────────────────────────┤
 *   │            │ Results | Tables | Notes | …       │
 *   └────────────┴────────────────────────────────────┘
 *   theory & equations (full width, below the fold)
 *
 * On phones it becomes one column: graph → inputs → results → theory.
 */

import { h, clear } from './dom';

export interface CalcSlots {
  root: HTMLElement;
  /** The calculator's name and version button, above the inputs toolbar */
  titleBar: HTMLElement;
  inputs: HTMLElement;
  /** Toolbar row at the top of the inputs pane (reset, examples…) */
  inputsToolbar: HTMLElement;
  /** Strip above the graph (graph picker, export) */
  graphBar: HTMLElement;
  graph: HTMLElement;
  info: InfoTabs;
  theory: HTMLElement;
}

export class InfoTabs {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private body: HTMLElement;
  private panes = new Map<string, { btn: HTMLButtonElement; pane: HTMLElement }>();
  private active = '';

  constructor() {
    this.bar = h('div', { class: 'info-tabs', role: 'tablist' });
    this.body = h('div', { class: 'info-body' });
    this.el = h('section', { class: 'pane pane-info' }, this.bar, this.body);
  }

  /** Add a tab; returns its content element. */
  add(id: string, label: string): HTMLElement {
    const pane = h('div', { class: 'info-pane', role: 'tabpanel', hidden: true, dataset: { tab: id } });
    const btn = h('button', { class: 'info-tab', role: 'tab', type: 'button', dataset: { tab: id }, onclick: () => this.show(id) }, label);
    this.bar.appendChild(btn);
    this.body.appendChild(pane);
    this.panes.set(id, { btn, pane });
    if (!this.active) this.show(id);
    return pane;
  }

  has(id: string): boolean {
    return this.panes.has(id);
  }

  ids(): string[] {
    return [...this.panes.keys()];
  }

  current(): string {
    return this.active;
  }

  /** Hide/show a tab button (e.g. no tables for this result) */
  setVisible(id: string, on: boolean): void {
    const p = this.panes.get(id);
    if (!p) return;
    p.btn.hidden = !on;
    if (!on && this.active === id) this.show(this.panes.keys().next().value!);
  }

  /** After all tabs were added: a page always opens on its results (the diagram is in the graph pane). */
  openDefault(): void {
    const id = this.panes.has('results') ? 'results' : this.panes.keys().next().value;
    if (id) this.show(id);
  }

  show(id: string): void {
    for (const [k, { btn, pane }] of this.panes) {
      const on = k === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
      pane.hidden = !on;
    }
    this.active = id;
  }

  setBadge(id: string, text: string | null, tone: 'warn' | 'info' = 'warn'): void {
    const p = this.panes.get(id);
    if (!p) return;
    p.btn.querySelector('.badge')?.remove();
    if (text) p.btn.appendChild(h('span', { class: `badge badge-${tone}` }, text));
  }
}

export function buildCalcPage(container: HTMLElement): CalcSlots {
  clear(container);
  const titleBar = h('div', { class: 'pane calc-titlebar' });
  const inputsToolbar = h('div', { class: 'inputs-toolbar' });
  const inputs = h('div', { class: 'inputs-body' });
  const graphBar = h('div', { class: 'graph-bar' });
  const graph = h('div', { class: 'graph-host' });
  const info = new InfoTabs();
  const theory = h('div', { class: 'theory-body' });

  const root = h(
    'div',
    { class: 'calc-page' },
    h(
      'div',
      { class: 'calc-main' },
      // The title and the inputs are two cards, one above the other, in the left column.
      h('aside', { class: 'pane-inputs' }, titleBar, h('div', { class: 'pane inputs-card' }, inputsToolbar, inputs)),
      h('section', { class: 'pane pane-graph' }, graphBar, graph),
      info.el,
    ),
    h('section', { class: 'theory' }, theory),
  );
  container.appendChild(root);
  return { root, titleBar, inputs, inputsToolbar, graphBar, graph, info, theory };
}
