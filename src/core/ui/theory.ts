/**
 * Theory / equations section renderer. Content is trusted HTML written in the calculator
 * module, with TeX between $…$ (inline) or $$…$$ (display), rendered by KaTeX.
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { h } from './dom';

export interface TheorySection {
  title: string;
  html: string;
  /** Optional figure (e.g. a Schematic svg) shown beside the text */
  figure?: () => Element;
}

export function texToHtml(src: string): string {
  return src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => katex.renderToString(t, { displayMode: true, throwOnError: false }))
    .replace(/\$([^$\n]+?)\$/g, (_, t) => katex.renderToString(t, { displayMode: false, throwOnError: false }));
}

export function renderTheory(host: HTMLElement, intro: { title: string; lead: string }, sections: TheorySection[], version?: string): void {
  const toc = h('nav', { class: 'theory-toc' }, h('div', { class: 'theory-toc-title' }, 'Contents'));
  const body = h('div', { class: 'theory-sections' });
  sections.forEach((s, i) => {
    const id = `th-${i}`;
    toc.appendChild(h('a', { href: `#${id}`, onclick: (e: Event) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); } }, s.title));
    const text = h('div', { class: 'theory-text' });
    text.innerHTML = texToHtml(s.html);
    const sec = h('section', { class: `theory-section${s.figure ? ' has-figure' : ''}`, id }, h('h3', null, s.title), text);
    if (s.figure) sec.appendChild(h('figure', { class: 'theory-figure' }, s.figure()));
    body.appendChild(sec);
  });
  const lead = h('p', { class: 'theory-lead' });
  lead.innerHTML = texToHtml(intro.lead);
  const ver = version ? h('p', { class: 'theory-version' }, `Calculator version ${version}`) : null;
  host.append(h('header', { class: 'theory-head' }, h('h2', null, intro.title), lead, ver), h('div', { class: 'theory-grid' }, toc, body));
}
