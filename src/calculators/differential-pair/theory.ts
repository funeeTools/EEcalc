import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Microstrip differential pair — how this calculator works',
    lead:
      'Two traces side by side on an outer layer, over one reference plane, carry a differential signal as the odd mode of a coupled microstrip. Part of the field runs in air, so the two modes see different effective permittivities and travel at different speeds. This page uses the Kirschning–Jansen equations for the even and odd modes, with Jansen’s copper-thickness correction, and solves for the width, gap or dielectric height that gives a target differential impedance.',
  },
  sections: [
    {
      title: 'Even and odd modes',
      html: `<p>A signal on the pair splits into an <em>odd</em> mode (equal and opposite voltages: the differential signal) and an <em>even</em> mode (equal voltages: common mode). Each has its own impedance and effective permittivity:</p>
$$Z_{diff} = 2Z_{0o},\\qquad Z_{cm} = \\tfrac12 Z_{0e},\\qquad k = \\frac{Z_{0e}-Z_{0o}}{Z_{0e}+Z_{0o}}$$
<p>The odd-mode field concentrates in the gap, much of it in air, so $\\varepsilon_{eff,o} < \\varepsilon_{eff,e}$: the differential signal travels faster than the common mode. That speed difference is what produces far-end crosstalk and mode conversion on microstrip; a stripline pair in a uniform dielectric has none.</p>`,
    },
    {
      title: 'Kirschning–Jansen equations (zero thickness)',
      html: `<p>With $u = W/H$ and $g = S/H$, Kirschning and Jansen (1984) fitted the static mode permittivities to rigorous spectral-domain results:</p>
$$\\varepsilon_{eff,e} = \\varepsilon_{eff}^{HJ}(v),\\qquad v = u\\,\\frac{20+g^2}{10+g^2} + g\\,e^{-g}$$
$$\\varepsilon_{eff,o} = \\left[\\tfrac{\\varepsilon_r+1}{2} + a_o - \\varepsilon_{eff}\\right]e^{-c_o g^{d_o}} + \\varepsilon_{eff}$$
<p>where $\\varepsilon_{eff}^{HJ}$ is the Hammerstad–Jensen single-line permittivity and $a_o, c_o, d_o$ are their fitted functions of $u$ and $\\varepsilon_r$. The impedances correct the single line $Z_L$ by fitted coupling factors $Q_4$ and $Q_{10}$:</p>
$$Z_{0e,0o} = \\sqrt{\\frac{\\varepsilon_{eff}}{\\varepsilon_{eff,e/o}}}\;\\frac{Z_L}{1 - Z_L\\sqrt{\\varepsilon_{eff}}\\,Q_{4/10}/\\eta_0}$$
<p>They quote better than 0.6 % for $0.1 \\le u \\le 10$, $0.1 \\le g \\le 10$, $1 \\le \\varepsilon_r \\le 18$. Against a 2-D field solution the page agrees to 0.15 % in $Z_{diff}$ and 0.4 % in $Z_{cm}$.</p>`,
    },
    {
      title: 'Copper thickness',
      html: `<p>Thick copper adds capacitance at the trace edges. Jansen (1978) splits it between the modes: the even mode gets the fraction</p>
$$j = 1 - \\tfrac12\\,e^{-0.69\\,\\Delta w/\\Delta t},\\qquad \\Delta t = \\frac{2tH}{S\\varepsilon_r}$$
<p>of a single trace’s thickness correction $\\Delta w$ (tight coupling hides the inner edges, so $j \\to \\tfrac12$; loose coupling gives $j \\to 1$), and the odd mode also gains the parallel-plate capacitance of the two facing side walls, $2\\varepsilon_0 t/S$. Jansen wrote these as extra strip widths fed back into the zero-thickness formulas. The page applies the same increments to the capacitances instead — in air and in the dielectric separately, as Hammerstad and Jensen do for a single line — using the Hammerstad–Jensen thickness correction for $\\Delta w$. Checked on 27 cross-sections ($W/H$ 0.5–2, $S/H$ 0.3–1.5, $T/H$ up to 0.175): $Z_{diff}$ −0.9 to +1.3 %, $Z_{cm}$ −2.7 to +0.4 % (worst for 1 oz on 0.2 mm with narrow traces); an independent reviewer’s solver found $Z_{diff}$ up to +2.0 % and $Z_{cm}$ down to −3.8 %, so the page states −0.9 to +2.0 % and −3.8 to +0.4 %. The reason for the capacitance form is $Z_{diff}$: on the same field solutions the width form errs $Z_{diff}$ by up to +4–5 % (and by up to +17 % in a common transcription that mixes the mode widths). It is not better everywhere: for $Z_{cm}$ the width form is sometimes closer (an independent check found −0.5 to −1.6 % for it against −0.7 to −3.8 % here), so treat $Z_{cm}$ with thick copper on thin laminate as good to about 4 %.</p>`,
    },
    {
      title: 'Solving for the unknown',
      html: `<p>Click ◎ beside $W$, $S$ or $H$. The page scans that dimension on a log scale (keeping $W/H$ and $S/H$ within 0.02–50) and polishes the bracket with Brent’s method on the same forward model, so the answer fed back reproduces the target. $Z_{diff}$ falls as the traces widen, rises with the dielectric height, and rises with the gap towards twice the single-trace impedance — it can never exceed $2Z_0$, so a target above that needs narrower traces or a thicker dielectric, not a wider gap.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Solder mask</strong> fills the gap where the odd-mode field is strongest and lowers $Z_{diff}$ by several ohms — more than it lowers a single trace. It is not modelled here; include it in the fabricator’s field-solver run.</li>
<li>Keep the gap constant along the route; a pair that splits around a via or pad becomes two single-ended lines with $Z_{diff} \\to 2Z_0$.</li>
<li>Tighter coupling (small $S$) makes the pair more robust against noise and saves space, but makes $Z_{diff}$ more sensitive to etch variation of the gap.</li>
<li>Above a few GHz microstrip disperses: both permittivities rise towards $\\varepsilon_r$. The impedances here are the static values.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>M. Kirschning, R. H. Jansen, “Accurate Wide-Range Design Equations for the Frequency-Dependent Characteristic of Parallel Coupled Microstrip Lines,” IEEE Trans. MTT, vol. 32, no. 1, Jan. 1984, pp. 83–90; correction vol. 33, no. 3, Mar. 1985, p. 288.</li>
<li>R. H. Jansen, “High-Speed Computation of Single and Coupled Microstrip Parameters Including Dispersion, High-Order Modes, Loss and Finite Strip Thickness,” IEEE Trans. MTT, vol. 26, no. 2, Feb. 1978, pp. 75–82.</li>
<li>E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S Digest, 1980, pp. 407–409.</li>
<li>Qucs technical documentation, §11 “Parallel coupled microstrip lines” (transcription used to cross-check the equations).</li>
<li>R. Garg, I. J. Bahl, “Characteristics of Coupled Microstriplines,” IEEE Trans. MTT, vol. 27, no. 7, July 1979, pp. 700–705.</li>
</ol>`,
    },
  ],
};
