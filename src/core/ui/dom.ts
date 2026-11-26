/** Tiny DOM helpers — no framework. */

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, any> & { class?: string; style?: string | Partial<CSSStyleDeclaration> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function applyAttrs(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign((el as HTMLElement).style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign((el as HTMLElement).dataset, v);
    } else if (k in el && k !== 'list' && typeof v !== 'string') {
      (el as any)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Create an element from an HTML string (trusted, internal content only). */
export function html(markup: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let id: number | undefined;
  return (...a: A) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => fn(...a), ms);
  };
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Equation symbol with "_" subscript notation → nodes: "f_c" → f<sub>c</sub>, "I_pk" → I<sub>pk</sub>,
 * "ΔI_L/I_out" → ΔI<sub>L</sub>/I<sub>out</sub>. A subscript runs over letters, digits, commas and "−".
 */
export function symNodes(sym: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /_([\p{L}\p{N},−]+)/gu;
  let last = 0;
  for (const m of sym.matchAll(re)) {
    if (m.index! === 0) continue;
    out.push(sym.slice(last, m.index));
    const sub = document.createElement('sub');
    sub.textContent = m[1];
    out.push(sub);
    last = m.index! + m[0].length;
  }
  out.push(sym.slice(last));
  return out.filter((x) => x !== '');
}
