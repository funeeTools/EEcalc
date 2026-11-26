/** Shared result widgets: headline status + chips, key/value tables, note lists. */

import { h, clear } from './dom';

export type Tone = 'pass' | 'fail' | 'warn' | 'muted' | 'accent' | '';

export interface Chip {
  label: string;
  value: string;
  tone?: Tone;
  title?: string;
}

export function renderHeadline(host: HTMLElement, o: { status?: { text: string; tone: Tone }; chips: Chip[]; sub?: string }): void {
  clear(host);
  const row = h('div', { class: 'chips' });
  if (o.status) row.appendChild(h('span', { class: `status status-${o.status.tone}` }, o.status.text));
  for (const c of o.chips) {
    row.appendChild(h('span', { class: `chip ${c.tone ? 'chip-' + c.tone : ''}`, title: c.title ?? '' }, h('span', { class: 'chip-label' }, c.label), h('span', { class: 'chip-value' }, c.value)));
  }
  host.appendChild(row);
  if (o.sub) host.appendChild(h('div', { class: 'headline-sub' }, o.sub));
}

export type KvRow = [label: string, value: string, tone?: Tone] | { heading: string };

export function kvTable(rows: KvRow[], cls = ''): HTMLElement {
  const t = h('table', { class: `kv ${cls}`.trim() });
  const tb = h('tbody');
  for (const r of rows) {
    if (!Array.isArray(r)) {
      tb.appendChild(h('tr', { class: 'kv-head' }, h('th', { colspan: 2 }, r.heading)));
      continue;
    }
    tb.appendChild(h('tr', { class: r[2] ? `tone-${r[2]}` : '' }, h('th', null, r[0]), h('td', null, r[1])));
  }
  t.appendChild(tb);
  return t;
}

export function noteList(items: string[], tone: Tone = ''): HTMLElement {
  return h('ul', { class: `notes ${tone ? 'notes-' + tone : ''}`.trim() }, ...items.map((s) => h('li', null, s)));
}

export function block(title: string, ...content: (Node | null)[]): HTMLElement {
  return h('div', { class: 'block' }, h('h4', { class: 'block-title' }, title), ...content);
}
