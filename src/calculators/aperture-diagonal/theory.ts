import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Aperture diagonal — how this calculator works',
    lead:
      'Boards are drilled and routed with round tools, but many things that pass through them are rectangular: square header posts, flat connector tabs, shell lugs and rectangular cutouts. A round hole clears a rectangle only if its diameter reaches the rectangle’s diagonal, and a routed opening keeps the cutter’s radius in every inside corner. This page gives the diagonal, the smallest stocked hole that covers it (with the IPC-7251 lead clearance when it is a plated hole for a pin), and the routed opening a square-cornered part needs.',
  },
  sections: [
    {
      title: 'The diagonal and the covering hole',
      html: `<p>Every corner of an $L \\times W$ rectangle lies on its circumscribed circle, whose diameter is the diagonal</p>
$$d = \\sqrt{L^2 + W^2}$$
<p>(the angle in a semicircle is a right angle, so the rectangle’s diagonal is a diameter). No smaller circle contains all four corners, so a round hole for a rectangular pin or opening must be at least $d$ across. A 0.64 mm (0.025″) square post has $d$ = 0.905 mm; a 2 × 1.5 mm rectangle has $d$ = 2.5 mm exactly.</p>
<p>For a pin in a plated hole a clearance $c$ is added for insertion and solder flow. IPC-7251 sizes the finished hole as the maximum lead diameter plus 0.25 mm (level A, most material), 0.20 mm (level B, nominal) or 0.15 mm (level C, least material); for a non-round lead the maximum dimension is its diagonal:</p>
$$D_{\\text{needed}} = d + c,\\qquad D = \\text{next grid size} \\ge D_{\\text{needed}}$$
<p>Fabricators offer finished hole sizes on a grid (commonly 0.05 mm steps from about 0.15 mm, drilled up to about 6.3–6.5 mm). The page rounds up to that grid, so the hole never pinches the corners. Larger openings are routed.</p>`,
    },
    {
      title: 'Routed openings and corner radii',
      html: `<p>A router bit of diameter $d_r$ cannot cut a sharp inside corner: every inside corner keeps the radius $r = d_r/2$. A pocket of nominal size $L_o \\times W_o$ therefore loses $(4-\\pi)r^2$ of area at its corners, and a square-cornered part of the same nominal size will not drop in.</p>
<p>Centre the part in an opening grown by $g$ on each side. The part’s corner lies on the diagonal of the fillet’s centre, at distance $\\sqrt2\\,(r-g)$ from it, so its gap to the fillet is $r - \\sqrt2\\,(r-g)$. Asking for the same clearance $c/2$ there as at the flat sides gives</p>
$$r - \\sqrt2\\,(r-g) \\ge \\tfrac{c}{2} \\iff g \\ge r - \\frac{r - c/2}{\\sqrt2}\\qquad\\big(= r(1 - \\tfrac{1}{\\sqrt2}) \\approx 0.293\\,r \\text{ for } c = 0\\big)$$
<p>so $g = \\max\\big(c/2,\\ r - (r - c/2)/\\sqrt2\\big)$ and the opening is $(L+2g) \\times (W+2g)$. With $c = 0$ the corner just touches the fillet. Where the extra width is not acceptable, a <strong>dog-bone</strong> relief keeps the nominal size: the fabricator plunges the cutter at each corner with its centre $r/\\sqrt2$ in from both edges, so the circle passes through the sharp corner. The cutter must also fit: $d_r \\le \\min(L_o, W_o)$.</p>`,
    },
    {
      title: 'Solving for a side',
      html: `<p>Choose L or W with ◎ and enter the diagonal you can afford — typically the drill you have, minus the clearance. The side follows in closed form, $L = \\sqrt{d^2 - W^2}$, which needs $d > W$. Example: the widest 2 mm-long opening that one 2.5 mm drill covers is 1.5 mm wide (a 3-4-5 triangle).</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Square header pins.</strong> 0.64 mm posts need d + 0.20 mm = 1.105 mm, so a 1.15 mm finished hole on a 0.05 mm grid; a 1.0 mm hole clears the corners by under 0.1 mm, which makes insertion of a whole row of pins hard.</li>
<li><strong>Flat tabs.</strong> A round hole for a 1.7 × 0.6 mm tab leaves almost 0.6 mm of gap at the flats, which the solder must bridge. A plated slot (routed, then plated) fits a flat tab much better; most fabricators offer plated slots from about 0.5–0.6 mm wide.</li>
<li><strong>Specify finished sizes.</strong> Give finished hole sizes (after plating) in the drill table; the fabricator drills about 0.1–0.15 mm larger to allow for the copper plated into the barrel.</li>
<li><strong>Ask for the cutter.</strong> Internal cutouts are commonly routed with 0.8–2.4 mm bits; if the corner radius matters, put it on the fabrication drawing or draw the dog-bones yourself.</li>
</ul>`,
    },
    {
      title: 'Limits',
      html: `<ul>
<li>The lead size is its maximum material size (largest tolerance); position tolerance of the pins and the hole is not included.</li>
<li>The grid, smallest hole, largest drill and router size are fabricator-specific; the defaults are typical, not a standard.</li>
<li>Board-edge routing, the tool path and the slot length-to-width rules of plated slots are not covered.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-7251 (draft 1), <em>Generic Requirements for Through-Hole Design and Land Pattern Standard</em>, IPC, 2008: hole diameter = maximum lead diameter + 0.25 / 0.20 / 0.15 mm for density levels A / B / C (most / nominal / least).</li>
<li>Euclid, <em>Elements</em>, Book III, Proposition 31 (the angle in a semicircle is a right angle).</li>
</ol>`,
    },
  ],
};
