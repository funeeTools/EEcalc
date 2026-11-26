import type { TheoryContent } from '@/core/calc/types';
import { ACCURACY, CHECKED } from './model';

const band = (r: readonly [number, number]) => `${r[0] >= 0 ? '+' : '−'}${Math.abs(r[0]).toFixed(1)} … ${r[1] >= 0 ? '+' : '−'}${Math.abs(r[1]).toFixed(1)} %`;

export const theory: TheoryContent = {
  intro: {
    title: 'Edge-coupled embedded microstrip — how this calculator works',
    lead:
      'An embedded (buried) microstrip pair sits on a substrate over one ground plane, with more dielectric — prepreg, a second core or solder mask — covering it, and air above that. It is between an open microstrip (field partly in air) and a stripline (field fully in dielectric, two planes). This page models it the way the field divides: the impedances of the same pair in air from the Kirschning–Jansen coupled-microstrip equations, and an effective permittivity for each mode with a burial correction for the cover.',
  },
  sections: [
    {
      title: 'Modes and differential impedance',
      html: `<p>Two coupled traces carry two quasi-TEM modes. In the <b>odd</b> mode (the differential signal) the traces are driven $+V$ and $-V$; in the <b>even</b> mode (common-mode noise) both at $+V$. Each mode has its own impedance and effective permittivity:</p>
$$Z_{0o} = \\frac{Z_{0o}^{air}}{\\sqrt{\\varepsilon_{eff,o}}},\\qquad Z_{0e} = \\frac{Z_{0e}^{air}}{\\sqrt{\\varepsilon_{eff,e}}},\\qquad Z_{diff} = 2Z_{0o},\\qquad Z_{cm} = \\frac{Z_{0e}}{2}$$
<p>$Z^{air}$ is the impedance of the same geometry with every dielectric removed; only the effective permittivities know about the substrate and the cover.</p>`,
    },
    {
      title: 'Bare coupled microstrip (Kirschning–Jansen)',
      html: `<p>For a zero-thickness pair with $u = W/H$ and $g = S/H$, Kirschning and Jansen fitted the static mode permittivities</p>
$$\\varepsilon_{eff,e} = \\frac{\\varepsilon_r+1}{2} + \\frac{\\varepsilon_r-1}{2}\\left(1+\\frac{10}{v}\\right)^{-a(v)\\,b(\\varepsilon_r)},\\quad v = u\\,\\frac{20+g^2}{10+g^2} + g\\,e^{-g}$$
$$\\varepsilon_{eff,o} = \\left[\\frac{\\varepsilon_r+1}{2} + a_o - \\varepsilon_{eff}\\right] e^{-c_o g^{d_o}} + \\varepsilon_{eff}$$
<p>with $a(v), b(\\varepsilon_r)$ and $\\varepsilon_{eff}$ from Hammerstad–Jensen’s single microstrip, and the mode impedances</p>
$$Z_{0e,o}^{air} = \\frac{Z_{air}(u)}{1 - Z_{air}(u)\\,Q_{4,10}/\\eta_0}$$
<p>where $Q_4(u,g)$ and $Q_{10}(u,g)$ are their fitted functions (independent of $\\varepsilon_r$). They state 0.6 % accuracy for the impedances over $0.1 \\le u \\le 10$, $0.1 \\le g \\le 10$, $1 \\le \\varepsilon_r \\le 18$.</p>`,
    },
    {
      title: 'Copper thickness',
      html: `<p>Thick copper adds capacitance in two ways. The outer side walls widen each strip as for a single line (Hammerstad–Jensen’s $\\Delta u_1$ in air and $\\Delta u_r$ in the dielectric), but in the even mode the facing walls see no field, so — following Jansen — only part of that widening applies as the gap closes:</p>
$$u_e = u + \\Delta u\\left[1 - \\tfrac12\\,e^{-0.69\\,\\Delta u/\\Delta t}\\right],\\qquad \\Delta t = \\frac{2T/H}{g\\,\\varepsilon_r}$$
<p>In the odd mode the two facing walls form a parallel-plate capacitor to the virtual ground plane midway between the traces, $2\\varepsilon\\,T/S$ per unit length — Cohn’s gap term for thick coupled strips — filled with the cover dielectric (air for a bare pair). The page adds it to the odd-mode capacitance.</p>`,
    },
    {
      title: 'The cover (embedding)',
      html: `<p>The burial correction usually attributed to Wadell (we have it as restated in the open-source pcb-toolkit, not from the book itself) gives the effective permittivity of a microstrip buried a depth $d$ below the dielectric surface as</p>
$$\\varepsilon_{eff}' = \\varepsilon_r - (\\varepsilon_r - \\varepsilon_{eff})\\,e^{-2d/H}$$
<p>It runs from the bare value at $d = 0$ to $\\varepsilon_r$ (a fully embedded line) as the cover thickens. Written with filling factors — the share $q$ of the field in the substrate and the share $q_c$ of the remaining (air) field that the cover takes,</p>
$$\\varepsilon_{eff}' = 1 + q(\\varepsilon_r - 1) + (1-q)\\,q_c(\\varepsilon_{rc}-1),\\qquad q = \\frac{\\varepsilon_{eff}-1}{\\varepsilon_r-1},\\qquad q_c = 1 - e^{-2d/H}$$
<p>it is the same formula when the cover has the substrate’s permittivity, and extends to a cover of different $\\varepsilon_{rc}$ (prepreg of another Dk, solder mask). The page applies it to each mode with $d = H_2 + T$, the cover’s depth over the substrate surface. Burying the pair raises both mode permittivities, so it lowers $Z_{diff}$ and brings the odd and even velocities closer together — the reason buried traces have much less far-end crosstalk.</p>`,
    },
    {
      title: 'Accuracy',
      html: `<p>The combination above (Kirschning–Jansen, Jansen’s and Cohn’s thickness terms and the burial correction for the cover) has no published error bound of its own, so the page states one measured against a 2-D finite-volume solution of Laplace’s equation for the same cross-sections (two-strip symmetry, odd and even modes with and without dielectric, three grids with Richardson extrapolation; the solver reproduces Hammerstad–Jensen’s single microstrip to 0.07 %). Over ${ACCURACY.cases} random cross-sections with $W/H$ ${CHECKED.uMin}–${CHECKED.uMax}, $S/H$ ${CHECKED.gMin}–${CHECKED.gMax}, $T/H$ up to ${CHECKED.tMax}, $H_2/H$ 0–${CHECKED.h2Max}, $\\varepsilon_r$ ${CHECKED.erMin}–${CHECKED.erMax} and a cover from air to the substrate’s permittivity, the page’s values differ from the field solution by</p>
<table class="kv"><tr><th>Region</th><th>$Z_{diff}$</th><th>$Z_{cm}$</th></tr><tr><td>$S \\ge ${ACCURACY.core.gMin}H$, $T \\le ${ACCURACY.core.tMax}H$</td><td>${band(ACCURACY.core.zdiff)}</td><td>${band(ACCURACY.core.zcm)}</td></tr><tr><td>whole checked range</td><td>${band(ACCURACY.all.zdiff)}</td><td>${band(ACCURACY.all.zcm)}</td></tr></table>
<p>The largest errors come from thick copper in a narrow gap (the model reads $Z_{diff}$ low) and from very narrow gaps under a thin cover (it reads $Z_{diff}$ high: Wadell’s burial depth is measured against $H$, while the odd-mode field in a narrow gap is filled by a cover only $\\sim S$ thick). Outside the checked range the page warns. Fabrication tolerances (±10 % on $W$, ±10 % on $H$, the Dk of the glass/resin mix around the traces) are usually larger than the model error.</p>`,
    },
    {
      title: 'How solve-for works',
      html: `<p>Choose the unknown with ◎. For <b>W</b> or <b>S</b> the page finds where $Z_{diff}(x)$ equals the target, by scanning and Brent’s method on the same forward model, so the solved value reproduces the target exactly. $Z_{diff}$ falls as $W$ grows and rises with $S$ toward $2Z_0$ of a single trace; a target above that limit cannot be reached by widening the gap, and the page says so. The Tables tab lists the width for the common 85, 90 and 100 Ω targets at the present gap and stack-up.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>"Same as substrate" models a pair buried in one material, e.g. an inner layer referenced to one plane only, with prepreg above and no plane over it. If there is a plane above as well, it is a stripline: use the edge-coupled stripline calculators.</li>
<li>Solder mask is conformal — thinner over the copper and thicker in the gap — so the flat-cover model is a first estimate for masked outer layers; mask typically lowers $Z_{diff}$ by a few ohms.</li>
<li>Prepreg flows into the gap and its local Dk is resin-rich (lower than the laminate’s average). Ask the fabricator for the Dk they use for impedance control.</li>
<li>Keep the mode velocities in mind: on bare microstrip the even mode is slower than the odd mode, which turns into far-end crosstalk and mode conversion; a cover thicker than about $H$ makes them nearly equal.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>M. Kirschning and R. H. Jansen, “Accurate Wide-Range Design Equations for the Frequency-Dependent Characteristic of Parallel Coupled Microstrip Lines”, <i>IEEE Trans. Microwave Theory Tech.</i>, vol. MTT-32, no. 1, pp. 83–90, Jan. 1984 (corrections, MTT-33, p. 288, 1985).</li>
<li>E. Hammerstad and Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design”, IEEE MTT-S International Microwave Symposium Digest, 1980, pp. 407–409.</li>
<li>R. H. Jansen, “High-Speed Computation of Single and Coupled Microstrip Parameters Including Dispersion, High-Order Modes, Loss and Finite Strip Thickness”, <i>IEEE Trans. Microwave Theory Tech.</i>, vol. MTT-26, no. 2, pp. 75–82, Feb. 1978.</li>
<li>B. C. Wadell, <i>Transmission Line Design Handbook</i>, Artech House, 1991, §3.5.4 (embedded microstrip) — the burial formula as restated in pcb-toolkit, docs.rs/pcb-toolkit (impedance/embedded.rs); not verified against the book, hence the field-solver accuracy check above.</li>
<li>J. Svačina, “Analysis of Multilayer Microstrip Lines by a Conformal Mapping Method”, <i>IEEE Trans. Microwave Theory Tech.</i>, vol. 40, no. 4, pp. 769–772, Apr. 1992 (filling factors for layered dielectrics).</li>
<li>S. B. Cohn, “Shielded Coupled-Strip Transmission Line”, <i>IRE Trans. Microwave Theory Tech.</i>, vol. MTT-3, no. 5, pp. 29–38, Oct. 1955 (eq. 22: the side-wall gap capacitance of thick coupled strips, used here for the odd mode).</li>
<li>S. Jahn et al., <i>Qucs Technical Papers</i>, §11 (coupled microstrip: Kirschning–Jansen and the thickness correction as implemented).</li>
</ol>`,
    },
  ],
};
