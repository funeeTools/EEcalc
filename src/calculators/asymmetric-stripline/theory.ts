import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Asymmetric stripline — how this calculator works',
    lead:
      'Most inner-layer traces are not centred between their planes: in a dual stripline two signal layers share one pair of planes, so each trace sits closer to one of them. This page computes the impedance of such an offset trace from Cohn’s broadside-coupled-strip formulas — one strip of a broadside pair in odd mode is exactly an offset stripline — with the copper thickness added by the image method, and solves for the width, either dielectric height or εr that gives a target impedance.',
  },
  sections: [
    {
      title: 'Why the odd mode of a broadside pair is an offset stripline',
      html: `<p>Stack two identical thin strips, gap $S$ apart, centred between planes $b$ apart, and drive them with opposite voltages. The mid-plane between them is then at zero potential everywhere — it behaves exactly like a ground plane. Each strip therefore sees a real plane $(b-S)/2$ away on one side and a virtual plane $S/2$ away on the other: an offset stripline. Cohn (1960) solved this geometry by conformal mapping. With $s = S/b$, $w = W/b$ and a parameter $k$ between $s$ and 1,</p>
$$w = \\frac{2}{\\pi}\\left[\\tanh^{-1}R - s\\,\\tanh^{-1}\\frac{R}{k}\\right],\\qquad R = \\sqrt{\\frac{k-s}{1/k-s}},\\qquad \\frac{C}{\\varepsilon} = \\frac{4\\tanh^{-1}k}{\\pi s}$$
<p>For the offset trace the page sets the virtual plane on the nearer side — Cohn’s derivation is for strips that are wide compared with that spacing — so with the strip on its centre plane, $h_n = \\min(H_1,H_2)+T/2$ and $h_f = \\max(H_1,H_2)+T/2$, it uses $b' = 2(h_n+h_f)$ and $S' = 2h_n$. $k$ is found by bisection, written in $\\tanh^{-1}k$ so that wide traces keep full precision.</p>`,
    },
    {
      title: 'Narrow traces and copper thickness',
      html: `<p>Cohn’s formula treats the two edges of the strip as independent, which costs accuracy when the trace is narrow compared with $h_n$ (about −4 % at $W = h_n/4$). The same formula evaluated for a <em>centred</em> trace with plane spacing $2h_n$ shows almost the same deficit, and that case has Cohn’s exact solution $C/\\varepsilon = 4K(k)/K(k')$, $k=\\tanh(\\pi W/4h_n)$. The page adds that difference back, so the centred case is exact and narrow offset traces lose most of the error.</p>
<p>Copper thickness is added with the image method of Wadell (§3.6.3): each face of the trace sees a centred stripline of spacing $2H_1+T$ or $2H_2+T$ and carries half of its capacitance. Only the thickness <em>increments</em> of those two lines are used (Cohn’s 1954 fringing capacitance with Wheeler’s 1978 thick strip, as on the edge-coupled stripline page), added to the thin result. With $H_1 = H_2$ everything reduces to the symmetric stripline. Finally $Z_0 = \\eta_0/(\\sqrt{\\varepsilon_r}\\,C/\\varepsilon)$, and because the dielectric is homogeneous the line is pure TEM: $\\varepsilon_{eff} = \\varepsilon_r$.</p>`,
    },
    {
      title: 'Accuracy',
      html: `<p>The model was checked against a 2-D finite-volume solution of the Laplace equation (graded mesh, three-grid Richardson extrapolation; it reproduces the exact centred stripline to 0.03 %) on 60 cross-sections with $H_2/H_1$ = 1.5–5, $W/h_n$ = 0.25–4 and $T/h_n$ = 0–0.25:</p>
<ul><li>$W \\ge h_n$: +0.0 to +0.9 %;</li><li>$W = h_n/2$: +0.2 to +1.7 %;</li><li>$W = h_n/4$: +0.3 to +2.6 % (largest with thick copper far off-centre).</li></ul>
<p>The plain image method (the parallel combination of the two virtual centred lines, Wadell eq. 3.6.3.22) read +0.2 to +7.2 % on the same set, and the IPC-2141A asymmetric-stripline equation is coarser still. The page shows the image estimate for comparison, and warns outside the checked range.</p>`,
    },
    {
      title: 'Return current and the dual stripline',
      html: `<p>The return current divides between the two planes roughly in proportion to the capacitance to each; the page estimates the split from the two image half-lines. A trace close to one plane returns most of its current there, which is why a dual stripline needs both planes solid under the routing and stitched together near layer changes.</p>
<p>In a dual stripline the two signal layers are routed at right angles, so a crossing trace on the other layer barely changes the impedance and is ignored. Long parallel runs on the two layers couple broadside — much more strongly than side-by-side traces — so avoid them, or design them deliberately on the Broadside-Coupled Pair page. With the second layer switched on, the page also gives the impedance of a trace of the same width on that layer and the width it needs for the target.</p>`,
    },
    {
      title: 'Solving for the unknown',
      html: `<p>Click ◎ beside $W$, $H_1$, $H_2$ or $\\varepsilon_r$. The page scans the field’s range on a log scale and polishes the bracket with Brent’s method on the same forward model, so the answer fed back reproduces the target. $Z_0$ falls with $W$ and $\\varepsilon_r$ and rises with either height, but moving one plane away has less and less effect because the nearer plane holds most of the field.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul><li>Core and prepreg rarely have the same Dk; the model assumes one value. Use the fabricator’s stack-up Dk of the layer nearer the trace if they differ.</li><li>Prepreg flows around inner-layer copper, so the pressed thickness above a trace is less than the nominal prepreg thickness; ask the fabricator for the pressed value.</li><li>Fabricators hold impedance to ±10 % (±5 % on request) with their own field solver.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. B. Cohn, “Characteristic Impedances of Broadside-Coupled Strip Transmission Lines,” IRE Trans. MTT, vol. 8, no. 6, Nov. 1960, pp. 633–637.</li>
<li>Rogers Corporation, Design Note 3.2.1, “Design Equations for Broadside and Edgewise Stripline Couplers,” 2003.</li>
<li>S. B. Cohn, “Characteristic Impedance of the Shielded-Strip Transmission Line,” IRE Trans. MTT, vol. 2, July 1954, pp. 52–57.</li>
<li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Trans. MTT, vol. 26, no. 11, Nov. 1978, pp. 866–876.</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991, §3.6.3 “Off-center stripline.”</li>
<li>IPC-2141A, <em>Design Guide for High-Speed Controlled Impedance Circuit Boards</em>, 2004.</li>
</ol>`,
    },
  ],
};
