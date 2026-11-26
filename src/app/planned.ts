import { h } from '@/core/ui/dom';
import type { CalcEntry, Category } from './registry';

/** Placeholder for calculators that are on the roadmap but not built yet. */
export function renderPlanned(cat: Category, calc: CalcEntry): HTMLElement {
  const others = cat.calcs.filter((c) => c.load && c.id !== calc.id);
  return h(
    'div',
    { class: 'planned-page', dataset: { calc: calc.id } },
    h(
      'div',
      { class: 'planned-card' },
      h('div', { class: 'planned-kicker' }, `${cat.icon}  ${cat.title}`),
      h('h1', null, calc.title),
      h('div', { class: 'planned-meta' }, h('span', { class: 'pill pill-planned' }, 'Planned'), h('code', { class: 'pill' }, calc.id)),
      h(
        'p',
        { class: 'planned-note' },
        'Not built yet. It will use the standard page: inputs on the left, a live graph top-right, results and data tabs below it, and theory & equations underneath — and it will be controllable through the AI API like every finished calculator.',
      ),
      others.length
        ? h('p', { class: 'planned-note' }, 'Ready in this category: ', ...others.map((o) => h('a', { href: `#/${o.id}` }, o.title)))
        : null,
    ),
  );
}
