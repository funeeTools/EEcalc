import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Dual stripline — how this calculator works',
    lead:
      'A dual stripline puts two signal layers between one pair of reference planes, which saves two plane layers on a multilayer board. Routed at right angles, each layer behaves as an offset stripline in which the other signal layer is only dielectric. This page gives the impedance of a trace on each layer, solves either width, either outer dielectric or εr for a target impedance, and shows how strongly two traces would couple if they ran on top of each other.',
  },
  sections: [
    {
      title: 'The stack and the orthogonal-routing assumption',
      html: `<p>From the bottom: a plane, $H_1$ of dielectric, layer 1 with traces $W_1\\times T$, a dielectric $D$ between the facing copper surfaces, layer 2 with traces $W_2\\times T$, $H_2$ of dielectric and the upper plane, so the planes are $b = H_1 + T + D + T + H_2$ apart.</p>
<p>The layers are routed at right angles (one mostly horizontal, the other mostly vertical). A layer-1 trace then meets layer-2 copper only where traces cross, over a length about one trace width, and the small extra capacitance there is spread along the line. Away from crossings the layer-1 trace sees the lower plane $H_1$ below and the upper plane $H_{far,1} = D + T + H_2$ above, with nothing but dielectric between: an offset stripline. Layer 2 is the mirror image, $H_2$ to its near plane and $H_{far,2} = D + T + H_1$ to the far one.</p>`,
    },
    {
      title: 'Impedance of each layer',
      html: `<p>Both traces use the offset-stripline model of the Asymmetric Stripline page. Driving a pair of stacked strips with opposite voltages puts a zero-potential wall half-way between them, so one strip of a broadside-coupled pair in odd mode <em>is</em> an offset stripline, and Cohn’s 1960 conformal-mapping solution gives it. With $s = S'/b'$, $w = W/b'$ and a parameter $k \\in (s,1)$,</p>
$$w = \\frac{2}{\\pi}\\left[\\tanh^{-1}R - s\\,\\tanh^{-1}\\frac{R}{k}\\right],\\qquad R = \\sqrt{\\frac{k-s}{1/k-s}},\\qquad \\frac{C}{\\varepsilon} = \\frac{4\\tanh^{-1}k}{\\pi s}$$
<p>where, with the strip on its centre plane, $h_n = \\min(H,H_{far}) + T/2$, $h_f = \\max(H,H_{far}) + T/2$, $b' = 2(h_n+h_f)$ and $S' = 2h_n$. The narrow-strip shortfall of this formula is restored from Cohn’s exact centred stripline, and the copper thickness is added with Wadell’s image method (each face sees a centred line of spacing $2H+T$ and carries half of its thickness increment). Then</p>
$$Z_0 = \\frac{\\eta_0}{\\sqrt{\\varepsilon_r}\\;C/\\varepsilon},\\qquad t_{pd} = \\frac{\\sqrt{\\varepsilon_r}}{c},$$
<p>the same delay on both layers because the dielectric is homogeneous (pure TEM, $\\varepsilon_{eff} = \\varepsilon_r$). Against a 2-D field solution the model reads +0 to +0.9 % high for $W \\ge h_n$ and up to +2.6 % for $W = h_n/4$; the page warns outside the checked range ($H_{far}/H \\le 5$, $T/(2H+T) \\le 0.45$).</p>
<p>The classic one-line dual-stripline equation of the IPC high-speed design guides rests on the same picture; it is not used here because its fitted constants are much coarser than the conformal-mapping result.</p>`,
    },
    {
      title: 'Parallel runs couple broadside',
      html: `<p>Where a layer-1 trace runs directly over a layer-2 trace they form a broadside-coupled pair with facing gap $D$. Broadside coupling through a thin prepreg is far stronger than the edge coupling of neighbours on one layer, because the strips face each other across their whole width. The page reports the pair’s odd- and even-mode impedances and the backward coupling coefficient</p>
$$k_b = \\frac{Z_{0e}-Z_{0o}}{Z_{0e}+Z_{0o}},$$
<p>from Cohn’s broadside formulas (as on the Broadside-Coupled Pair page). That model assumes a symmetric stack; for unequal $H_1$, $H_2$ or widths it is evaluated at their means and flagged as an estimate. Above $k_b$ = 5 % the page warns: route the layers at right angles, keep parallel overlaps short or shift them sideways, or thicken $D$. The second graph shows how both impedances and $k_b$ change with $D$.</p>`,
    },
    {
      title: 'Solving for the unknown',
      html: `<p>Each layer has its own impedance box, $Z_{01}$ and $Z_{02}$. Click ◎ beside a width to solve <em>both</em> widths, each for its own target (the two layers differ whenever $H_1 \\ne H_2$, because each one’s far plane is at a different distance). $H_1$ and $\\varepsilon_r$ are solved for the layer-1 target and $H_2$ for the layer-2 target; the other layer’s impedance is then computed and shown in green. Each unknown is found by scanning its range on a log scale and polishing the bracket with Brent’s method on the same forward model, so the solved value fed back reproduces the target to 10⁻⁹.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul><li>Make $D$ the thickest dielectric of the stack: it lowers broadside crosstalk at little cost in impedance, since each trace’s field is held mostly by its own near plane.</li><li>Both planes carry return current. Stitch them with ground vias near every signal via that changes layer, and keep them unbroken under the routing.</li><li>Prepreg flows round inner-layer copper, so the pressed $D$ is thinner than the nominal sheet; ask the fabricator for pressed thicknesses and for the Dk of each layer, and use the one nearer the trace if core and prepreg differ.</li><li>Fabricators hold impedance to ±10 % (±5 % on request) with their own field solver.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. B. Cohn, “Characteristic Impedances of Broadside-Coupled Strip Transmission Lines,” IRE Trans. MTT, vol. 8, no. 6, Nov. 1960, pp. 633–637.</li>
<li>S. B. Cohn, “Characteristic Impedance of the Shielded-Strip Transmission Line,” IRE Trans. MTT, vol. 2, July 1954, pp. 52–57.</li>
<li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Trans. MTT, vol. 26, no. 11, Nov. 1978, pp. 866–876.</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991, §3.6.3 “Off-center stripline.”</li>
<li>IPC-2141A, <em>Design Guide for High-Speed Controlled Impedance Circuit Boards</em>, 2004.</li>
<li>E. Bogatin, <em>Signal and Power Integrity — Simplified</em>, 3rd ed., Prentice Hall, 2018, chapters on crosstalk and differential pairs.</li>
</ol>`,
    },
  ],
};
