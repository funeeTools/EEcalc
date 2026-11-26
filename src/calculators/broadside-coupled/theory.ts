import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Broadside-coupled pair — how this calculator works',
    lead:
      'A broadside pair puts the two traces of a differential pair on adjacent layers, one directly above the other, between two planes. Their wide faces look at each other across a thin core, so they couple far more tightly than side-by-side traces — useful for very tight couplers and for dense differential routing. This page uses Cohn’s conformal-mapping solution for broadside strips, adds the copper thickness, and solves for the width, the gap or the outer dielectric that gives a target differential impedance.',
  },
  sections: [
    {
      title: 'Modes and the impedances that matter',
      html: `<p>Driven with opposite voltages (the odd mode, the differential signal) the field runs mostly straight across the gap between the traces; driven together (the even mode, common mode) it runs outwards to the planes. With $Z_{0o}$ and $Z_{0e}$ the mode impedances of one trace,</p>
$$Z_{diff} = 2Z_{0o},\\qquad Z_{cm} = \\tfrac12 Z_{0e},\\qquad k = \\frac{Z_{0e}-Z_{0o}}{Z_{0e}+Z_{0o}},\\qquad Z_c = \\sqrt{Z_{0e}Z_{0o}}$$
<p>$k$ is the coupling of a quarter-wave directional coupler built from the pair and $Z_c$ its port impedance. The dielectric fills the whole cross-section, so both modes travel at $c/\\sqrt{\\varepsilon_r}$.</p>`,
    },
    {
      title: 'Cohn’s solution for thin traces',
      html: `<p>For infinitely thin traces of width $W$, gap $S$, centred between planes $b$ apart, Cohn (1960) found, with $s = S/b$, $w = W/b$ and one parameter $k$ between $s$ and 1,</p>
$$Z_{0e} = \\frac{\\eta_0}{2\\sqrt{\\varepsilon_r}}\\,\\frac{K(k')}{K(k)},\\qquad Z_{0o} = \\frac{\\pi\\eta_0}{4\\sqrt{\\varepsilon_r}}\\,\\frac{s}{\\tanh^{-1}k}$$
$$w = \\frac{2}{\\pi}\\left[\\tanh^{-1}R - s\\,\\tanh^{-1}\\frac{R}{k}\\right],\\qquad R = \\sqrt{\\frac{k-s}{1/k-s}}$$
<p>(Cohn wrote 188.3 Ω and 296.1 Ω for $\\eta_0/2$ and $\\pi\\eta_0/4$.) The page finds $k$ from $w$ by Brent’s method on $\\tanh^{-1}k$, so wide traces keep full precision. The formulas assume the traces are wide compared with their spacing — the close-coupling case they were derived for. Against a 2-D field solution they agree to 0.03–0.25 % for $W/(b-S)$ from 0.18 to 3.3, and they reproduce the Rogers design-note table of broadside couplers to its last digit.</p>`,
    },
    {
      title: 'Odd mode as an offset stripline, and copper thickness',
      html: `<p>In the odd mode the mid-plane is at zero potential, so each trace is an offset stripline: $H$ from its plane and $S/2$ from a virtual plane. The page computes the odd mode with the same model as the Asymmetric Stripline page — Cohn’s formula, its narrow-trace deficit restored from Cohn’s exact centred stripline, and the copper thickness added by the image method (Wadell §3.6.3), each face of the trace carrying half of the thickness increment of a centred stripline of spacing $2H+T$ or $S+T$. The even mode uses Cohn’s formula with each trace on its centre plane (gap $S+T$) plus the plane-side increment only, since the even mode faces a magnetic wall on the other side.</p>
<p>Checked against field solutions (this builder’s on 25 cross-sections, $W/S$ = 0.25–20, $T$ up to $0.35S$, and an independent reviewer’s): $Z_{diff}$ −0.1 to +1.2 %. $Z_{cm}$ depends on how wide the traces are: −0.65 to 0 % when $W \\ge S$ and $W/(b-S) \\ge 0.2$; down to −1.8 % for traces narrow against the plane spacing ($W/(b-S)$ ≈ 0.1); −2.6 % at $W = S/2$; and −7 % for loosely coupled narrow traces ($W = S/4$), where Cohn’s close-coupling assumption fails. The page shows the band that applies beside $Z_{cm}$ and warns for loose coupling.</p>`,
    },
    {
      title: 'Solving for the unknown',
      html: `<p>Click ◎ beside $W$, $S$ or $H$. The page scans that dimension on a log scale and polishes the bracket with Brent’s method on the same forward model, so the answer fed back reproduces the target. $Z_{diff}$ falls as the traces widen, rises with the gap towards twice the single-trace impedance, and rises with the outer dielectric. A typical 100 Ω broadside pair on FR-4 needs a fairly thick core between the traces; thin cores give very low $Z_{diff}$ — fine for couplers, not for interfaces.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Layer-to-layer registration is typically ±50–75 µm, so the traces are rarely exactly aligned. A lateral offset weakens the coupling and raises $Z_{diff}$; Shelton (1966) treats offset strips, but his design equations are not reproduced here, so this page assumes perfect alignment. Make the traces wide compared with the expected misregistration.</li>
<li>Core and prepreg have different Dk and the prepreg thickness after pressing depends on the copper density; ask the fabricator for pressed thicknesses and Dk per layer. The model assumes one $\\varepsilon_r$.</li>
<li>Broadside pairs couple strongly to anything on the same two layers above or below them; keep other routing away or orthogonal.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. B. Cohn, “Characteristic Impedances of Broadside-Coupled Strip Transmission Lines,” IRE Trans. MTT, vol. 8, no. 6, Nov. 1960, pp. 633–637.</li>
<li>Rogers Corporation, Design Note 3.2.1, “Design Equations for Broadside and Edgewise Stripline Couplers,” 2003 (formulas and the example-design table used in the tests).</li>
<li>S. B. Cohn, “Characteristic Impedance of the Shielded-Strip Transmission Line,” IRE Trans. MTT, vol. 2, July 1954, pp. 52–57.</li>
<li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Trans. MTT, vol. 26, no. 11, Nov. 1978, pp. 866–876.</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991, §3.6.3 and ch. 4.</li>
<li>J. P. Shelton, “Impedances of Offset Parallel-Coupled Strip Transmission Lines,” IEEE Trans. MTT, vol. 14, no. 1, Jan. 1966, pp. 7–15.</li>
</ol>`,
    },
  ],
};
