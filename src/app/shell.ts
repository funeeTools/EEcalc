/**
 * App shell: category tabs (always shown) → a click-open menu of that category's calculators → the
 * calculator page. The menu lies over the top of the page and stays open until a calculator is picked,
 * the user clicks elsewhere or presses Escape (moving the mouse away does not close it).
 * Route lives in the URL hash (#/rf/microstrip-impedance) so every page is linkable. Inputs may
 * be given in the hash query (#/rf/microstrip-impedance?W=0.3mm&solveFor=W) — handy for links
 * and for agents that can only open URLs.
 */

import { CalcController } from '@/core/calc/page';
import { h, clear, storage } from '@/core/ui/dom';
import { currentTheme } from '@/core/ui/theme';
import { updateSettings } from '@/core/settings';
import { renderPlanned } from './planned';
import { SettingsPanel } from './settings-panel';
import { CalcPreview } from './preview';
import { CATEGORIES, DEFAULT_ROUTE, type CalcEntry, type Category, findCalc } from './registry';
import { APP_VERSION } from './version';

interface Route {
  cat: string;
  calc: string;
  query: Record<string, string>;
}

const LAST_CALC_KEY = 'eecalc:lastCalcByCategory';

function parseHash(): Route | null {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/([\w-]+))?\/?(?:\?(.*))?$/);
  if (!m) return null;
  const cat = CATEGORIES.find((c) => c.id === m[1]);
  if (!cat) return null;
  const calc = m[2] && cat.calcs.some((c) => c.slug === m[2]) ? m[2] : firstCalcFor(cat);
  const query: Record<string, string> = {};
  if (m[3]) for (const [k, v] of new URLSearchParams(m[3])) query[k] = v;
  return { cat: cat.id, calc, query };
}

function firstCalcFor(cat: Category): string {
  const last = storage.get<Record<string, string>>(LAST_CALC_KEY, {})[cat.id];
  if (last && cat.calcs.some((c) => c.slug === last)) return last;
  return (cat.calcs.find((c) => c.load) ?? cat.calcs[0]).slug;
}

export class Shell {
  private catBar!: HTMLElement;
  /** The drop-down menu of one category's calculators (inside the header, over the page) */
  private calcBar!: HTMLElement;
  /** Category whose menu is open, or '' */
  private menuCat = '';
  private content!: HTMLElement;
  private crumb!: HTMLElement;
  private finder!: Finder;
  private settingsPanel!: SettingsPanel;
  private preview = new CalcPreview();
  private route: Route = { ...DEFAULT_ROUTE, query: {} };
  private mountToken = 0;
  /** The running calculator page (null on placeholder pages) */
  controller: CalcController | null = null;
  currentId = '';
  private mounted: Promise<void> = Promise.resolve();
  private routeListeners = new Set<() => void>();

  constructor(private root: HTMLElement) {}

  start(): void {
    this.build();
    window.addEventListener('hashchange', () => this.onRoute());
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.closeMenu();
        this.finder.open();
      }
      if (e.key === 'Escape' && this.menuCat) this.closeMenu();
    });
    this.onRoute();
  }

  /** Navigate to a calculator and resolve once it is mounted. */
  async open(id: string): Promise<void> {
    const target = `#/${id}`;
    if (location.hash.split('?')[0] !== target) {
      const done = new Promise<void>((res) => {
        const fn = () => {
          this.routeListeners.delete(fn);
          res();
        };
        this.routeListeners.add(fn);
      });
      location.hash = target;
      await done;
    }
    await this.mounted;
  }

  private build(): void {
    this.catBar = h('nav', { class: 'cat-tabs', 'aria-label': 'Categories' });
    this.calcBar = h('nav', { class: 'calc-tabs', 'aria-label': 'Calculators', hidden: true });
    this.content = h('main', { class: 'content' });
    this.crumb = h('span', { class: 'crumb' });
    this.finder = new Finder((id) => (location.hash = `#/${id}`));
    this.settingsPanel = new SettingsPanel();
    const themeBtn = h('button', {
      class: 'hdr-icon-btn theme-btn',
      type: 'button',
      'aria-label': 'Toggle dark mode',
      onclick: () => updateSettings({ theme: currentTheme() === 'dark' ? 'light' : 'dark' }),
    });
    const syncThemeBtn = () => {
      const dark = currentTheme() === 'dark';
      themeBtn.textContent = dark ? '☀' : '☾';
      themeBtn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    };
    syncThemeBtn();
    window.addEventListener('ee:theme', syncThemeBtn);

    const header = h(
      'header',
      { class: 'app-header' },
      h(
        'div',
        { class: 'brand-row' },
        h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, 'EE'), h('span', { class: 'brand-name' }, 'EEcalc'), h('span', { class: 'brand-version', title: `EEcalc version ${APP_VERSION} (calculators carry their own version)` }, `v${APP_VERSION}`)),
        this.crumb,
        themeBtn,
        h('a', { class: 'ai-btn', href: './ai.html', target: '_blank', title: 'How AI agents can drive EEcalc (window.eeCalc)' }, 'AI API'),
        h(
          'button',
          { class: 'finder-btn', type: 'button', onclick: () => this.finder.open(), title: 'Find a calculator (Ctrl+K)' },
          h('span', { class: 'finder-icon' }, '⌕'),
          h('span', { class: 'finder-label' }, 'Find calculator…'),
          h('kbd', null, 'Ctrl K'),
        ),
        h('button', { class: 'hdr-icon-btn settings-btn', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: () => this.settingsPanel.open() }, '⚙'),
      ),
      this.catBar,
      this.calcBar,
    );
    this.root.append(header, this.content, this.finder.el, this.settingsPanel.el, this.preview.el);
    // Draw the hover cards' diagrams as soon as the mouse comes near the tab strip.
    this.calcBar.addEventListener('pointerenter', () => this.preview.warm(CATEGORIES.find((c) => c.id === this.menuCat)?.calcs ?? []));

    for (const cat of CATEGORIES) {
      const ready = cat.calcs.filter((c) => c.load).length;
      this.catBar.appendChild(
        h(
          'a',
          {
            class: 'cat-tab',
            href: `#/${cat.id}`,
            dataset: { cat: cat.id },
            title: `${cat.title} · ${ready} ready / ${cat.calcs.length}`,
            'aria-haspopup': 'true',
            'aria-expanded': 'false',
            // A plain click opens the menu; ctrl/middle-click still follows the link.
            onclick: (e: MouseEvent) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              if (this.menuCat === cat.id) this.closeMenu();
              else this.openMenu(cat.id);
            },
          },
          h('span', { class: 'cat-icon' }, cat.icon),
          h('span', { class: 'cat-label-long' }, cat.title),
          h('span', { class: 'cat-label-short' }, cat.short),
          h('span', { class: 'cat-caret', 'aria-hidden': 'true' }, '▾'),
        ),
      );
    }
    // Close the menu on a click anywhere outside it and the category tabs.
    document.addEventListener('click', (e) => {
      const t = e.target as Node;
      if (this.menuCat && !this.calcBar.contains(t) && !this.catBar.contains(t)) this.closeMenu();
    });
  }

  private openMenu(catId: string): void {
    this.menuCat = catId;
    this.renderMenu();
    this.calcBar.hidden = false;
    this.syncCatTabs();
  }

  private closeMenu(): void {
    if (!this.menuCat) return;
    this.menuCat = '';
    this.calcBar.hidden = true;
    this.preview.hide();
    this.syncCatTabs();
  }

  private syncCatTabs(): void {
    for (const a of this.catBar.querySelectorAll<HTMLElement>('.cat-tab')) {
      const on = a.dataset.cat === this.route.cat;
      const open = a.dataset.cat === this.menuCat;
      a.classList.toggle('active', on);
      a.classList.toggle('open', open);
      a.setAttribute('aria-expanded', String(open));
      if (on && !this.menuCat) revealInStrip(this.catBar, a);
    }
  }

  private onRoute(): void {
    const r = parseHash();
    if (!r) {
      history.replaceState(null, '', `#/${DEFAULT_ROUTE.cat}/${DEFAULT_ROUTE.calc}`);
      this.onRoute();
      return;
    }
    // Normalise "#/rf" → "#/rf/<calc>" and drop the input query once applied.
    if (location.hash !== `#/${r.cat}/${r.calc}`) history.replaceState(null, '', `#/${r.cat}/${r.calc}`);
    this.route = r;
    const last = storage.get<Record<string, string>>(LAST_CALC_KEY, {});
    last[r.cat] = r.calc;
    storage.set(LAST_CALC_KEY, last);
    this.renderTabs();
    this.mounted = this.mount();
    void this.mounted.then(() => {
      for (const fn of [...this.routeListeners]) fn();
    });
  }

  private renderTabs(): void {
    const { cat: catId, calc: slug } = this.route;
    this.closeMenu();
    this.syncCatTabs();
    const found = findCalc(catId, slug);
    clear(this.crumb);
    if (found) this.crumb.append(h('span', { class: 'crumb-cat' }, `${found.cat.title} › `), h('span', { class: 'crumb-calc' }, found.calc.title));
    document.title = found ? `${found.calc.title} · EEcalc` : 'EEcalc';
  }

  /** Fill the menu with the open category's calculators: ready ones as buttons, planned ones folded away. */
  private renderMenu(): void {
    const cat = CATEGORIES.find((c) => c.id === this.menuCat);
    clear(this.calcBar);
    this.preview.hide();
    if (!cat) return;
    const slug = this.route.cat === cat.id ? this.route.calc : '';
    const ready = cat.calcs.filter((c) => c.load);
    const planned = cat.calcs.filter((c) => !c.load);
    const tab = (c: CalcEntry) => {
      const a = h('a', { class: `calc-tab${c.load ? '' : ' planned'}${c.slug === slug ? ' active' : ''}`, href: `#/${c.id}`, 'aria-label': c.title, onclick: () => this.closeMenu() }, c.tab ?? c.title);
      this.preview.attach(a, c);
      return a;
    };
    for (const c of ready) this.calcBar.appendChild(tab(c));
    const cur = cat.calcs.find((c) => c.slug === slug);
    if (cur && !cur.load) this.calcBar.appendChild(tab(cur));
    if (planned.length) {
      const list = h('div', { class: 'planned-list', hidden: true });
      for (const c of planned) list.appendChild(h('a', { class: `planned-item${c.slug === slug ? ' active' : ''}`, href: `#/${c.id}`, onclick: () => this.closeMenu() }, c.title));
      const sum = h('button', {
        class: 'calc-tab planned-sum',
        type: 'button',
        'aria-expanded': 'false',
        onclick: () => {
          list.hidden = !list.hidden;
          sum.setAttribute('aria-expanded', String(!list.hidden));
          sum.textContent = `Planned (${planned.length}) ${list.hidden ? '▾' : '▴'}`;
        },
      }, `Planned (${planned.length}) ▾`);
      this.calcBar.append(sum, list);
    }
  }

  private async mount(): Promise<void> {
    const token = ++this.mountToken;
    this.controller?.destroy();
    this.controller = null;
    const found = findCalc(this.route.cat, this.route.calc);
    if (!found) return;
    const { cat, calc } = found;
    this.currentId = calc.id;
    if (!calc.load) {
      clear(this.content);
      this.content.appendChild(renderPlanned(cat, calc));
      return;
    }
    this.content.classList.add('loading');
    try {
      const mod = (await calc.load()).default;
      if (token !== this.mountToken) return;
      this.controller = new CalcController(this.content, calc.id, calc.title, mod, this.route.query);
    } catch (err) {
      clear(this.content);
      this.content.appendChild(h('div', { class: 'error-card' }, h('h2', null, 'Could not load this calculator'), h('pre', null, String(err))));
      console.error(err);
    } finally {
      this.content.classList.remove('loading');
    }
  }
}

/** Horizontally scroll a tab strip so `el` is visible — without scrolling the page. */
function revealInStrip(strip: HTMLElement, el: HTMLElement): void {
  if (strip.scrollWidth <= strip.clientWidth) return;
  const left = el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
  if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) {
    strip.scrollLeft = left - (strip.clientWidth - el.offsetWidth) / 2;
  }
}

/** Searchable overlay of every calculator (doubles as the phone menu). */
class Finder {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private readyOnly: HTMLInputElement;

  constructor(private onPick: (id: string) => void) {
    this.input = h('input', { class: 'finder-input', type: 'search', placeholder: 'Search 250+ calculators…', autocomplete: 'off', oninput: () => this.render() });
    this.readyOnly = h('input', { type: 'checkbox', onchange: () => this.render() });
    this.list = h('div', { class: 'finder-list' });
    const panel = h(
      'div',
      { class: 'finder-panel', role: 'dialog', 'aria-label': 'Find calculator' },
      h('div', { class: 'finder-top' }, this.input, h('label', { class: 'finder-ready' }, this.readyOnly, 'Ready only'), h('button', { class: 'finder-close', type: 'button', onclick: () => this.close(), 'aria-label': 'Close' }, '✕')),
      this.list,
    );
    this.el = h('div', { class: 'finder', hidden: true, onclick: (e: MouseEvent) => e.target === this.el && this.close() }, panel);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') (this.list.querySelector('a') as HTMLAnchorElement | null)?.click();
    });
  }

  open(): void {
    this.el.hidden = false;
    this.input.value = '';
    this.render();
    setTimeout(() => this.input.focus(), 10);
  }

  close(): void {
    this.el.hidden = true;
  }

  private render(): void {
    const words = this.input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    clear(this.list);
    const match = (c: CalcEntry, cat: Category) => {
      if (this.readyOnly.checked && !c.load) return false;
      const hay = `${c.title} ${c.tab ?? ''} ${c.blurb} ${cat.title} ${c.slug}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    for (const cat of CATEGORIES) {
      const items = cat.calcs.filter((c) => match(c, cat));
      if (!items.length) continue;
      this.list.appendChild(h('div', { class: 'finder-cat' }, `${cat.icon}  ${cat.title}`));
      for (const c of items) {
        this.list.appendChild(
          h(
            'a',
            {
              class: `finder-item${c.load ? '' : ' planned'}`,
              href: `#/${c.id}`,
              onclick: (e: MouseEvent) => {
                e.preventDefault();
                this.close();
                this.onPick(c.id);
              },
            },
            h('span', { class: 'finder-title' }, c.title),
            h('span', { class: 'finder-blurb' }, c.blurb || c.id),
            c.load ? h('span', { class: 'pill pill-ready' }, 'ready') : h('span', { class: 'pill pill-planned' }, 'planned'),
          ),
        );
      }
    }
    if (!this.list.childElementCount) this.list.appendChild(h('div', { class: 'finder-empty' }, 'No match.'));
  }
}
