/**
 * Hover card for the calculator tab strip: appears at the mouse pointer at once (no tooltip delay)
 * with the calculator's title, blurb and its diagram drawn from the default inputs, so a user can
 * find a calculator by its picture. Mouse only; touch taps just open the tab.
 */

import { freshDefaults, runCompute } from '@/core/calc/page';
import { h, clear } from '@/core/ui/dom';
import type { CalcEntry } from './registry';

const OFFSET = 14;

export class CalcPreview {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private blurb: HTMLElement;
  private pic: HTMLElement;
  /** Default-input diagram per calculator id, drawn once */
  private diagrams = new Map<string, Promise<SVGElement | null>>();
  private current: CalcEntry | null = null;

  constructor() {
    this.title = h('div', { class: 'cp-title' });
    this.blurb = h('div', { class: 'cp-blurb' });
    this.pic = h('div', { class: 'cp-pic' });
    this.el = h('div', { class: 'calc-preview', hidden: true, 'aria-hidden': 'true' }, this.title, this.blurb, this.pic);
    // Redraw cached pictures in the new theme's colours (diagrams use CSS classes, but be safe with inline fills).
    window.addEventListener('ee:theme', () => this.diagrams.clear());
  }

  /** Give a tab link the hover card. */
  attach(a: HTMLElement, c: CalcEntry): void {
    a.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.show(c, e));
    a.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && this.place(e));
    a.addEventListener('pointerleave', () => this.hide());
    a.addEventListener('click', () => this.hide());
  }

  /** Start drawing these calculators' diagrams so their cards are ready before the mouse reaches them. */
  warm(calcs: CalcEntry[]): void {
    for (const c of calcs) if (c.load) void this.diagram(c);
  }

  hide(): void {
    this.current = null;
    this.el.hidden = true;
  }

  private show(c: CalcEntry, e: PointerEvent): void {
    this.current = c;
    this.title.textContent = c.title;
    this.blurb.textContent = c.blurb || (c.load ? '' : 'Planned: not built yet.');
    clear(this.pic);
    this.pic.hidden = !c.load;
    this.el.hidden = false;
    this.place(e);
    if (!c.load) return;
    void this.diagram(c).then((svg) => {
      if (this.current !== c) return;
      clear(this.pic);
      if (svg) this.pic.append(svg.cloneNode(true));
      else this.pic.hidden = true;
      this.place(null);
    });
  }

  private last = { x: 0, y: 0 };

  /** Put the card's corner at the pointer, flipped to stay on screen. */
  private place(e: PointerEvent | null): void {
    if (e) this.last = { x: e.clientX, y: e.clientY };
    if (this.el.hidden) return;
    const { x, y } = this.last;
    const w = this.el.offsetWidth;
    const ht = this.el.offsetHeight;
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + w > innerWidth - 8) left = Math.max(8, x - OFFSET - w);
    if (top + ht > innerHeight - 8) top = Math.max(8, y - OFFSET - ht);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  private diagram(c: CalcEntry): Promise<SVGElement | null> {
    let p = this.diagrams.get(c.id);
    if (!p) {
      p = c.load!()
        .then(({ default: mod }) => {
          if (!mod.diagram) return null;
          const state = freshDefaults(mod.def);
          return mod.diagram.draw(state, runCompute(mod.def, state), false);
        })
        .catch((err) => {
          console.error('preview', c.id, err);
          return null;
        });
      this.diagrams.set(c.id, p);
    }
    return p;
  }
}
