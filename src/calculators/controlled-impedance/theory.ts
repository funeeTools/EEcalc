import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Controlled impedance — how this calculator works',
    lead:
      'A controlled-impedance trace is a transmission line whose characteristic impedance is set by its width, the dielectric between it and its reference plane, and what surrounds it. This page computes the single-ended impedance of the five line types found on ordinary boards — bare and solder-mask-coated microstrip, embedded microstrip, symmetric stripline and grounded coplanar waveguide — from published closed-form models, and solves for the width, height, permittivity or CPWG gap that gives a target impedance. Each model’s accuracy was measured against a 2-D field solution and is shown beside the answer.',
  },
  sections: [
    {
      title: 'Quasi-static impedance',
      html: `<p>Below a few GHz the field around a PCB trace is close to a static field (quasi-TEM), so the line is described by its capacitance per unit length $C'$ and the capacitance $C'_a$ of the same conductors with all dielectric replaced by air:</p>
$$Z_0 = \\frac{1}{c\\sqrt{C'\\,C'_a}},\\qquad \\varepsilon_{eff} = \\frac{C'}{C'_a},\\qquad t_{pd} = \\frac{\\sqrt{\\varepsilon_{eff}}}{c}$$
<p>The inductance $L' = 1/(c^2 C'_a)$ does not depend on the dielectric. Where part of the field runs in air (microstrip, CPWG) $\\varepsilon_{eff}$ lies between 1 and $\\varepsilon_r$; a stripline in a uniform dielectric is pure TEM and $\\varepsilon_{eff} = \\varepsilon_r$.</p>`,
    },
    {
      title: 'Surface microstrip',
      html: `<p>For a bare trace on top of the board the page uses the Hammerstad–Jensen equations (the same as the Microstrip Impedance page): with $u = W/H$,</p>
$$Z_{0,air}(u) = \\frac{\\eta_0}{2\\pi}\\ln\\!\\left[\\frac{f(u)}{u}+\\sqrt{1+\\frac{4}{u^2}}\\right],\\qquad \\varepsilon_{eff} = \\frac{\\varepsilon_r+1}{2}+\\frac{\\varepsilon_r-1}{2}\\left(1+\\frac{10}{u}\\right)^{-ab}$$
<p>with their fitted $f(u)$, $a(u)$, $b(\\varepsilon_r)$ and their copper-thickness correction, which widens the strip by $\\Delta u$ for the air capacitance and by a smaller amount for the dielectric part. Hammerstad and Jensen quote 0.2 % in $\\varepsilon_{eff}$ for $0.01 \\le u \\le 100$; the field check here agreed to 0.2 %.</p>`,
    },
    {
      title: 'Solder mask and embedded microstrip',
      html: `<p>A cover on top of the board — conformal solder mask, or a prepreg layer that buries the trace — replaces some of the air above the strip with dielectric and pulls $\\varepsilon_{eff}$ up and $Z_0$ down. Following Bahl and Stuchly, the cover only displaces air, so</p>
$$\\varepsilon_{eff,covered} = \\varepsilon_{eff,bare} + \\Delta q\\,(\\varepsilon_c - 1),\\qquad Z_0 = \\frac{Z_{0,air}}{\\sqrt{\\varepsilon_{eff,covered}}}$$
<p>where $\\Delta q$ is the share of the bare line’s air field that now lies inside the cover. It comes from the multilayer filling factor $q_2$ of Wan and Hoorfar (an improved form of Svačina’s conformal-mapping result), evaluated for a cover whose top is $h_2$ above the plane and taken relative to the uncovered line so that it vanishes at zero cover:</p>
$$\\Delta q = q_2\\!\\left(u,\\tfrac{h_2}{H}\\right) - q_2(u, 1)$$
<p>For solder mask $h_2 = H + C$; for an embedded trace $h_2 = H + T + H_c$. $\\Delta q$ is capped at the air share of the bare line, $1 - q_{sub}$ with $q_{sub} = (\\varepsilon_{eff,bare}-1)/(\\varepsilon_r-1)$.</p>
<p>Wan and Hoorfar give separate formulas for wide ($W \\ge H$) and narrow strips, and they do not meet at $W = H$: with 20 µm of mask on 0.2 mm the published pair makes $Z_0$ jump by +0.9 % there, so $Z_0$ would not fall steadily with width. This page smooths that published discontinuity, blending the two branches with a smoothstep in $\\ln(W/H)$ over $W/H$ = 0.91–1.1; outside that band each formula is used exactly as published.</p>
<p><strong>Accuracy — read this before relying on the mask value.</strong> The filling factor describes a flat cover. Real mask is conformal: it also runs down the trace side walls, exactly where the field is strongest. Against a 2-D field solution of the conformal mask ($C/H$ = 0.0125–0.25, $W/H$ = 0.5–4, $\\varepsilon_m$ = 3.5) the model captures only about 34–86 % of the mask’s effect, so $Z_0$ reads 0.35–2.1 % high (this builder’s check and an independent reviewer’s solver combined): for a 50 Ω line under 20 µm of mask on 0.2 mm prepreg the field solver gives about −1.4 Ω where this model gives about −0.7 Ω. For a planar embedded cover ($H_c$ up to 3$H$) it reads 1.1–2.8 % high. Treat the coated result as an upper bound and allow 1–2 Ω extra margin, or confirm critical designs with a field solver.</p>`,
    },
    {
      title: 'Symmetric stripline',
      html: `<p>A trace centred between two planes in a uniform dielectric has Cohn’s exact conformal-mapping solution for zero thickness,</p>
$$Z_0 = \\frac{\\eta_0}{4\\sqrt{\\varepsilon_r}}\\,\\frac{K(k')}{K(k)},\\qquad k = \\tanh\\frac{\\pi W}{2b},\\quad b = 2H + T$$
<p>where $K$ is the complete elliptic integral of the first kind (computed with the arithmetic–geometric mean). Copper thickness adds fringing capacitance at the strip edges; Cohn’s correction scales the exact thin-strip result by his edge capacitance and uses Wheeler’s thick-strip formula for the parallel-plate part, giving 0.3 % against a field solver for $T/b \\le 0.2$ and −1.1 to +0.6 % up to $T/b = 0.45$, the largest the page accepts. On this page $H$ is the dielectric from the trace to each plane.</p>`,
    },
    {
      title: 'Grounded coplanar waveguide (CPWG)',
      html: `<p>A CPWG trace has ground copper on both sides, a gap $G$ away, stitched by vias to a plane under the laminate. Conformal mapping (Ghione and Naldi; Simons) splits the capacitance into the air half-space above the copper and the laminate below:</p>
$$C'_a = 2\\varepsilon_0\\left[\\frac{K(k_1)}{K(k_1')} + \\frac{K(k_3)}{K(k_3')}\\right],\\qquad C' = 2\\varepsilon_0\\left[\\frac{K(k_1)}{K(k_1')} + \\varepsilon_r\\frac{K(k_3)}{K(k_3')}\\right]$$
$$k_1 = \\frac{W}{W+2G},\\qquad k_3 = \\frac{\\tanh(\\pi W/4H)}{\\tanh\\big(\\pi(W+2G)/4H\\big)}$$
<p>assuming wide ground pours and zero thickness (0.1–0.8 % against the field solution for $G \\le H$; with the pours further away the map misses the field that wraps from the top of the trace round to the plane, and $Z_0$ reads 2–5 % high by $G = 1.5$–$3H$). Copper thickness adds the parallel-plate capacitance of the two gap side walls, $2\\varepsilon_0 T/G$, to the air term (the gaps are air-filled). With 1 oz copper on thin laminate this reads 1–2.4 % high against the field solution; Gupta’s equivalent-width correction was tried and dropped because it diverges once the copper is a sizeable fraction of the gap. In practice: keep vias along both pour edges at well under $\\lambda/10$ spacing, keep the pours at least $W + 2G$ wide, and remember that solder mask in the gaps lowers $Z_0$ further.</p>`,
    },
    {
      title: 'Solving for the unknown',
      html: `<p>Click ◎ beside $W$, $H$, $\\varepsilon_r$ or (for CPWG) $G$ to make it the unknown. The page keeps one set of forward equations and finds the value whose impedance equals the target by scanning the field’s range on a log scale and polishing the bracket with Brent’s method, so the solved value fed back in reproduces the target exactly. $Z_0$ falls with $W$ and $\\varepsilon_r$, rises with $H$, and on CPWG rises with $G$ towards the plain microstrip value. If the target cannot be reached the page says which way to move. The <em>Tables</em> tab shows the same stack-up as every line type: the impedance at the entered width and the width each would need for the target.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Use your fabricator’s stack-up Dk and thickness, not the laminate data sheet’s headline value: resin content and glass style move FR-4 between about 3.6 and 4.6.</li>
<li>Outer copper is plated: finished 1 oz outer layers are often 45–50 µm, and etched traces are trapezoidal (narrower on top), which raises $Z_0$ by 1–3 %.</li>
<li>Fabricators control impedance to ±10 % as standard and ±5 % on request, using a field solver on their own stack-up; use this page to choose dimensions and the fabricator’s solver to sign off.</li>
<li>The impedance is the static value. Above a few GHz microstrip $\\varepsilon_{eff}$ rises with frequency (dispersion); stripline does not disperse.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S Int. Microwave Symp. Digest, 1980, pp. 407–409.</li>
<li>C. Wan, A. Hoorfar, “Improved Design Equations for Multilayer Microstrip Lines,” IEEE Microwave and Guided Wave Letters, vol. 10, no. 6, June 2000, pp. 223–224.</li>
<li>J. Svačina, “Analysis of Multilayer Microstrip Lines by a Conformal Mapping Method,” IEEE Trans. MTT, vol. 40, no. 4, 1992, pp. 769–772.</li>
<li>I. J. Bahl, S. S. Stuchly, “Analysis of a Microstrip Covered with a Lossy Dielectric,” IEEE Trans. MTT, vol. 28, no. 2, Feb. 1980, pp. 104–109.</li>
<li>S. B. Cohn, “Characteristic Impedance of the Shielded-Strip Transmission Line,” IRE Trans. MTT, vol. 2, July 1954, pp. 52–57.</li>
<li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Trans. MTT, vol. 26, no. 11, Nov. 1978, pp. 866–876.</li>
<li>G. Ghione, C. Naldi, “Coplanar Waveguides for MMIC Applications: Effect of Upper Shielding, Conductor Backing, Finite-Extent Ground Planes, and Line-to-Line Coupling,” IEEE Trans. MTT, vol. 35, no. 3, 1987, pp. 260–267.</li>
<li>R. N. Simons, <em>Coplanar Waveguide Circuits, Components, and Systems</em>, Wiley, 2001, §2.4.</li>
<li>K. C. Gupta, R. Garg, I. Bahl, P. Bhartia, <em>Microstrip Lines and Slotlines</em>, 2nd ed., Artech House, 1996, ch. 7.</li>
<li>R. Garg, I. J. Bahl, “Characteristics of Coupled Microstriplines,” IEEE Trans. MTT, vol. 27, no. 7, July 1979, pp. 700–705.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §3.7 (Example 3.5, stripline).</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991.</li>
<li>IPC-2141A, <em>Design Guide for High-Speed Controlled Impedance Circuit Boards</em>, 2004.</li>
</ol>`,
    },
  ],
};
