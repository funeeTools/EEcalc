import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Asymmetric edge-coupled stripline — how this calculator works',
    lead:
      'Most inner-layer differential pairs are not centred between their planes: the core below and the prepreg above differ, or a second signal layer shares the planes. This page builds the pair from two sourced pieces — the field-checked offset-stripline model for one trace, and Cohn’s coupled stripline at an equivalent centred spacing for the coupling — states how far the result is from a 2-D field solution, and solves for the width, the gap or either dielectric height that gives a target differential impedance.',
  },
  sections: [
    {
      title: 'Modes and impedances',
      html: `<p>A signal on the pair splits into the odd mode (opposite voltages: the differential signal) and the even mode (equal voltages: common mode). With the dielectric filling the whole cross-section both are pure TEM and travel at $c/\\sqrt{\\varepsilon_r}$, so each impedance follows from a capacitance per length, written here normalised to the permittivity, $C/\\varepsilon$:</p>
$$Z_{0e,0o} = \\frac{\\eta_0}{\\sqrt{\\varepsilon_r}\\;C_{e,o}/\\varepsilon},\\qquad Z_{diff} = 2Z_{0o},\\qquad Z_{cm} = \\tfrac12 Z_{0e},\\qquad k_b = \\frac{Z_{0e}-Z_{0o}}{Z_{0e}+Z_{0o}}$$`,
    },
    {
      title: 'The model: an equivalent centred pair',
      html: `<p>An off-centre coupled pair has no elementary conformal map. The page builds it from two sourced pieces and one assumption.</p>
<ul><li><strong>One trace alone.</strong> The single offset trace is the model of the Asymmetric Stripline page: one strip of a broadside pair in odd mode is an offset stripline, so Cohn’s 1960 broadside solution gives it; the narrow-strip deficit is restored from Cohn’s exact centred line and the copper thickness added by Wadell’s image method. Against a 2-D field solution it is within +0.9 % for $W \\ge H_{near}$.</li>
<li><strong>The coupling.</strong> The pair is assumed to couple like the <em>centred</em> pair whose single trace has the same capacitance. The page finds that equivalent plane spacing $b_{eq}$ from</li></ul>
$$C_{s}^{centred}(W, b_{eq}, T) = C_{s}^{offset}(W, T, H_1, H_2),\\qquad 2H_{near}+T \\le b_{eq} \\le 2H_{far}+T,$$
<p>and takes $Z_{0e}$, $Z_{0o}$ from Cohn’s 1955 coupled stripline at $(W, S, b_{eq}, T)$ — exact for thin strips, $\\frac{\\eta_0}{4\\sqrt{\\varepsilon_r}}K(k')/K(k)$ with $k_e = \\tanh\\frac{\\pi W}{2b}\\tanh\\frac{\\pi(W+S)}{2b}$, $k_o = \\tanh\\frac{\\pi W}{2b}\\coth\\frac{\\pi(W+S)}{2b}$, with his thickness corrections (eqs. 18, 20 for $S \\ge 5T$, 22 for $S < 5T$), as on the Edge-Coupled Stripline page.</p>
<p>The construction is exact in the two limits that matter: for $H_1 = H_2$ it is the symmetric pair, and as $S \\to \\infty$ both modes become the single offset trace. Every impedance also rises monotonically as either plane moves away, as it must. Two other combinations were tried and rejected: the plain image method (each mode as half the sum of two centred lines of spacing $2H_i+T$) reads up to +9.7 % high in $Z_{0e}$; adding image-method coupling increments to the offset trace reads $Z_{diff}$ up to 3.8 % low and, worse, makes it fall again beyond $H_{far}/H_{near} \\approx 4$. The plain image estimate is shown under Comparison.</p>`,
    },
    {
      title: 'Accuracy',
      html: `<p>The model was compared with a 2-D finite-volume solution of Laplace’s equation (graded mesh, three-grid Richardson extrapolation, odd and even mode by symmetry) on 300 cross-sections: $H_{far}/H_{near}$ = 1–5, $W/H_{near}$ = 0.25–2, $S/H_{near}$ = 0.25–4, $T/H_{near}$ = 0, 0.1 and 0.25. The offset pair couples a little more strongly than its equivalent centred pair, so $Z_{diff}$ reads slightly high:</p>
<ul><li>thin copper: $Z_{diff}$ +0.1…+1.1 % up to $H_{far}/H_{near} = 2$, +0.5…+2.1 % up to 3, +0.6…+3.5 % up to 5; $Z_{cm}$ within −2.6…+1.4 %;</li>
<li>with copper, Cohn’s thickness corrections add their own error, as on the symmetric page. Wide traces ($W \\ge H_{near}/2$) well apart ($S \\ge 8T$): +0…+3.2 % up to ratio 2, up to +5.7 % at 5. Narrow traces: up to +6.8 %. Just above Cohn’s formula switch ($5T \\le S < 8T$) the error is largest, +2…+10.7 %, and $Z_{cm}$ of narrow traces with $S < 5T$ reads up to −8 %.</li></ul>
<p>Each result card states the band for the current geometry, and the page warns outside the checked range. Cohn’s two thickness formulas also leave a small step at $S = 5T$; it shows on the gap graph, and a target inside it gives $S = 5T$ with a warning.</p>`,
    },
    {
      title: 'Solving for the unknown',
      html: `<p>Click ◎ beside $W$, $S$, $H_1$ or $H_2$. The page scans the range on a log scale (kept inside the model’s $W/b$, $S/b$ and $T/b \\le 0.2$ limits for both image lines) and polishes the bracket with Brent’s method on the same forward model, so the solved value fed back reproduces the target to 10⁻⁹. $Z_{diff}$ falls as the traces widen, rises with the gap towards twice the single-trace impedance, and rises with either height with diminishing effect as that plane moves away.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul><li>The pair’s return current and field crowd onto the nearer plane: keep that plane solid under the whole route, and stitch both planes with ground vias next to every via pair that changes layer.</li><li>If another signal layer shares the planes (a dual stripline), route it at right angles to the pair; this page counts it as dielectric.</li><li>Core and prepreg Dk usually differ and prepreg flows round the traces; use the fabricator’s pressed thicknesses and the Dk of the layer nearer the pair, and let their field solver confirm the final stack-up (impedance is held to ±10 %, ±5 % on request).</li><li>Keep $S \\le 2W$ or so for a tightly coupled pair that tolerates nearby aggressors; a loose pair behaves like two single-ended lines.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. B. Cohn, “Shielded Coupled-Strip Transmission Line,” IRE Trans. MTT, vol. 3, no. 5, Oct. 1955, pp. 29–38.</li>
<li>S. B. Cohn, “Characteristic Impedances of Broadside-Coupled Strip Transmission Lines,” IRE Trans. MTT, vol. 8, no. 6, Nov. 1960, pp. 633–637.</li>
<li>S. B. Cohn, “Characteristic Impedance of the Shielded-Strip Transmission Line,” IRE Trans. MTT, vol. 2, July 1954, pp. 52–57.</li>
<li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Trans. MTT, vol. 26, no. 11, Nov. 1978, pp. 866–876.</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991, §3.6.3 “Off-center stripline.”</li>
<li>IPC-2141A, <em>Design Guide for High-Speed Controlled Impedance Circuit Boards</em>, 2004.</li>
</ol>`,
    },
  ],
};
