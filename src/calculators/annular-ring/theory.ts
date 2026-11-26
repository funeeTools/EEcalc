import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Annular rings — how this calculator works',
    lead:
      'The annular ring is the copper left around a drilled hole in its pad. The drill never lands exactly on the pad centre, and the inner layers never line up perfectly, so the pad has to be large enough that a ring survives the worst case. This page sizes the pad (or the largest hole) with the IPC-2221 land formula, and checks it against the IPC-6012 acceptance rules of each class, including the classes that tolerate some breakout.',
  },
  sections: [
    {
      title: 'The land formula',
      html: `<p>IPC-2221 sets the minimum land diameter as</p>
$$D_{min} = a + 2b + c$$
<ul>
<li>$a$ is the largest hole the ring is measured from. On the outer layers it is the largest finished (plated) hole, the nominal size plus its tolerance. On the inner layers it is the drill, because the pads are drilled through before any plating.</li>
<li>$b$ is the minimum annular ring for supported holes: 0.050 mm on external layers and 0.025 mm on internal layers. These are also the IPC-6012 Class 3 acceptance limits.</li>
<li>$c$ is the standard fabrication allowance for drill wander and layer registration: 0.4 mm at producibility level A, 0.25 mm at level B and 0.2 mm at level C. Your fabricator may quote its own figure.</li>
</ul>
<p>The drill is the finished hole plus the drill allowance, about 0.1 mm to make room for two walls of plating.</p>`,
    },
    {
      title: 'Worst case and breakout',
      html: `<p>The allowance is a diameter, so the hole may sit $e = c/2$ off the pad centre. The narrowest ring is then</p>
$$b_{wc} = \\frac{D-a}{2} - e$$
<p>which is exactly $b$ for $D = D_{min}$. If $b_{wc}$ is negative, part of the hole wall lies outside the pad: the hole <em>breaks out</em>. For a hole of radius $r$ offset by $e$ in a pad of radius $R$, the wall points at angle $\\varphi$ from the offset direction lie at distance $\\sqrt{e^2+r^2+2er\\cos\\varphi}$ from the pad centre, so the broken-out arc is $2\\varphi_0$ with</p>
$$\\cos\\varphi_0 = \\frac{R^2-e^2-r^2}{2er}$$
<p>IPC-6012 accepts up to 90° of breakout on Class 2 boards and 180° on Class 1, so the smallest pad for those classes is the one whose worst-case breakout is just that angle:</p>
$$D_{min} = 2\\sqrt{e^2+r^2+2er\\cos(\\theta/2)}$$
<p>Class 2 boards are often designed to tangency instead ($b = 0$, no breakout), which the requirement list also offers. The pad drawn here is the same on every layer, so the larger of the external and internal minimums governs.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on the pad for the smallest pad that meets the requirement. The <em>pad / minimum</em> box is then a target: 100 % gives the bare minimum, 110 % a 10 % margin. Click ◎ on the finished hole for the largest hole the pad accepts at that ratio, or on the ratio to check a padstack as drawn. The hole is found by Brent’s method on the same land formula, so the answers agree with each other.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>The class is an acceptance criterion for the built board; the land formula with $b$ = 50 / 25 µm is the conservative design rule whatever the class.</li>
<li>Where a trace meets a pad that may break out, IPC-6012 also limits how much the junction narrows. Teardrops keep the connection intact.</li>
<li>Heavy copper (over 1 oz) and boards with more than eight layers usually need more allowance than the basic Table 9-1 figure. So do thick boards, where the drill wanders further.</li>
<li>Only plated (supported) holes are covered here. Unsupported holes need a larger ring.</li>
<li>The mask opening is usually the pad plus 0.05–0.1 mm per side; it does not affect the ring.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-2221B, <em>Generic Standard on Printed Board Design</em>, IPC, 2012, §9.1.1 (land requirements), Table 9-1 (fabrication allowance), Table 9-2 (minimum annular ring).</li>
<li>IPC-2222A, <em>Sectional Design Standard for Rigid Organic Printed Boards</em>, IPC, 2010.</li>
<li>IPC-6012E, <em>Qualification and Performance Specification for Rigid Printed Boards</em>, IPC, 2020 (annular ring and breakout by class).</li>
<li>Z. Peterson, “Meeting Standards: IPC 6012 Class 3 Via Sizes and Annular Rings”, Altium resources (worked land-size example).</li>
</ol>`,
    },
  ],
};
