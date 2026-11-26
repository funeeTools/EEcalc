import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'MOSFET operating point — how this calculator works',
    lead:
      'This page finds the DC operating point of an enhancement MOSFET with a drain resistor, biased by a fixed gate–source voltage or by a gate divider with a source resistor. It uses the square-law (Shichman–Hodges) model that textbooks and SPICE level 1 use, fitted to a datasheet with one transconductance or (V_GS, I_D) point. It reports the region, I_D, V_DS, g_m and r_o, and can solve for the gate bias or the drain resistor. Discrete power MOSFETs follow the square law only roughly; the page says where the fit is weak.',
  },
  sections: [
    {
      title: 'The square-law model',
      html: `<p>With overdrive $V_{ov} = V_{GS} - V_{th}$ and the transconductance parameter $K = \\mu C_{ox}W/L$:</p>
$$I_D = \\begin{cases} 0 & V_{ov} \\le 0 \\;\\text{(cutoff)}\\\\ K\\left(V_{ov}V_{DS} - \\tfrac12V_{DS}^2\\right)(1+\\lambda V_{DS}) & 0 \\le V_{DS} < V_{ov}\\;\\text{(triode)}\\\\ \\tfrac{K}{2}V_{ov}^2(1+\\lambda V_{DS}) & V_{DS} \\ge V_{ov}\\;\\text{(saturation)}\\end{cases}$$
<p>λ models channel-length modulation. Including $(1+\\lambda V_{DS})$ in the triode branch, as SPICE level 1 does, keeps the two branches continuous at $V_{DS} = V_{ov}$. The small-signal parameters are the partial derivatives; in saturation</p>
$$g_m = KV_{ov}(1+\\lambda V_{DS}) = \\frac{2I_D}{V_{ov}},\\qquad r_o = \\frac{1}{\\partial I_D/\\partial V_{DS}} = \\frac{2}{\\lambda KV_{ov}^2}$$`,
    },
    {
      title: 'Fitting K to a datasheet',
      html: `<p>Datasheets of discrete MOSFETs do not give $K$. Two ways to get it:</p>
<ul>
<li>From the forward transconductance $g_{fs}$ measured at a drain current $I_{D}$: in saturation $g_m = \\sqrt{2KI_D}$, so $K = g_{fs}^2/(2I_D)$.</li>
<li>From one point $(V_{GS1}, I_{D1})$ on the transfer curve: $K = 2I_{D1}/(V_{GS1}-V_{th})^2$.</li>
</ul>
<p>The fit is exact at that point. Away from it, a vertical power MOSFET departs from the square law: at high current its $I_D$ rises nearly linearly with $V_{GS}$ (velocity saturation and source resistance), and near threshold the current is exponential in $V_{GS}$ (subthreshold conduction), which the square law sets to zero. For the AO3400A preset at $V_{GS}$ = 2.5 V the square law predicts a channel resistance $1/(KV_{ov}) \\approx$ 7 mΩ, while the datasheet guarantees 48 mΩ (24 mΩ typical): use datasheet $R_{DS(on)}$ for switches. The page warns when the operating current is more than 5× above or 20× below the fit current.</p>
<p>The threshold voltage spread is usually the largest uncertainty: 0.8–3.0 V for the 2N7000. The page re-solves the bias at both ends of the spread when you enter them.</p>`,
    },
    {
      title: 'Solving the bias circuit',
      html: `<p>With the gate at $V_G$ (directly, or $V_{DD}R_2/(R_1+R_2)$ from a divider; the gate draws no DC current), Kirchhoff’s laws give</p>
$$V_{GS} = V_G - I_DR_S,\\qquad V_{DS} = V_{DD} - I_D(R_D+R_S),\\qquad I_D = f(V_{GS}, V_{DS})$$
<p>The residual $f(V_{GS}(I_D), V_{DS}(I_D)) - I_D$ falls strictly as $I_D$ grows from 0 to $V_{DD}/(R_D+R_S)$, so it has exactly one root, found by Brent’s method. The other solve options use the same forward model:</p>
<ul>
<li><strong>Gate bias for a target I<sub>D</sub>:</strong> $V_{DS}$ follows from the resistors, the overdrive is found by Brent’s method on the forward equation, and $V_G = V_{GS} + I_DR_S$ gives $R_2 = R_1V_G/(V_{DD}-V_G)$.</li>
<li><strong>R<sub>D</sub> for a target V<sub>DS</sub>:</strong> with $V_{DS}$ fixed, $I_D$ solves $I_D = f(V_G - I_DR_S, V_{DS})$, then $R_D = (V_{DD}-V_{DS})/I_D - R_S$.</li>
</ul>
<p><strong>P-channel</strong> devices are solved with magnitudes, measured downwards from $V_{DD}$ (the source side); the page shows $V_{GS}$ and $V_{DS}$ with their negative signs.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Use source degeneration.</strong> With $R_S$ the current depends much less on $V_{th}$ and $K$: a rise in $I_D$ lowers $V_{GS}$. Bypass $R_S$ with a capacitor to keep the AC gain $-g_m(R_D\\parallel r_o)$.</li>
<li><strong>Stay out of triode for gain.</strong> Saturation needs $V_{DS} \\ge V_{ov}$; leave some margin for the signal swing.</li>
<li><strong>Temperature.</strong> $V_{th}$ falls by a few mV/°C while the mobility (and $K$) falls; below the zero-temperature-coefficient point the current rises with temperature, which can cause thermal runaway in linear power stages.</li>
<li><strong>Gate protection.</strong> Keep $V_{GS}$ inside its ±rating (often ±20 V, ±12 V for logic-level parts); a large gate divider is high impedance, so add a series gate resistor near the pin in fast circuits.</li>
<li><strong>When it matters, measure.</strong> For a discrete part, sweep $V_{GS}$ at your $V_{DS}$ and fit $V_{th}$ and $K$ near the operating current.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>H. Shichman, D. A. Hodges, “Modeling and simulation of insulated-gate field-effect transistor switching circuits,” <em>IEEE J. Solid-State Circuits</em>, vol. 3, no. 3, pp. 285–289, 1968.</li>
<li>L. W. Nagel, <em>SPICE2: A computer program to simulate semiconductor circuits</em>, ERL Memo M520, University of California, Berkeley, 1975 (MOS level 1).</li>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015: ch. 5 (MOSFET I–V characteristics; the NMOS design example with $V_t$ = 0.7 V, $\\mu_nC_{ox}W/L$ = 3.2 mA/V², $I_D$ = 0.4 mA, $R_S$ = 3.25 kΩ, $R_D$ = 5 kΩ on ±2.5 V) and §7.4 (biasing).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015: ch. 3 (FETs).</li>
<li>Datasheets: onsemi 2N7000/2N7002/NDS7002A; Alpha &amp; Omega AO3400A; Infineon IRLML2502, IRLZ44N.</li>
</ul>`,
    },
  ],
};
