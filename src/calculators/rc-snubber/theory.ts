import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'RC snubber — how this calculator works',
    lead:
      'Every fast switching edge excites the loop inductance and the capacitance of the switch node into ringing, which adds voltage stress and EMI. An RC snubber across the switch or diode damps that ring. This page finds the parasitic L and C from two scope measurements, sizes the snubber resistor and capacitor, and shows the resulting overshoot and the power the resistor must dissipate. It follows the method in TI SLVA255 and Philip Todd’s Unitrode seminar on snubbers (SLUP100).',
  },
  sections: [
    {
      title: 'Finding the parasitics',
      html: `<p>The ring is a series resonance of the loop inductance $L_p$ with the node capacitance $C_p$ (switch $C_{oss}$, rectifier junction capacitance, layout). Neither is easy to know, but the ring frequency is easy to measure. Adding a known capacitor $C_{add}$ directly across the device lowers it:</p>
$$f_0 = \\frac{1}{2\\pi\\sqrt{L_p C_p}},\\qquad f_1 = \\frac{1}{2\\pi\\sqrt{L_p (C_p + C_{add})}}$$
<p>Dividing the two eliminates $L_p$:</p>
$$C_p = \\frac{C_{add}}{(f_0/f_1)^2 - 1},\\qquad L_p = \\frac{1}{(2\\pi f_0)^2 C_p},\\qquad Z_0 = \\sqrt{\\frac{L_p}{C_p}}$$
<p>If $C_{add}$ halves the frequency, $C_p = C_{add}/3$ (SLVA255 eq. 2). A much smaller shift makes the result sensitive to reading errors; a much larger $C_{add}$ brings its own inductance into play.</p>`,
    },
    {
      title: 'Sizing R and C',
      html: `<p>The resistor that best absorbs the ring energy matches the characteristic impedance of the tank, $R_s = Z_0$ (SLVA255 eq. 3). The capacitor must be large enough that, at the ring frequency, the resistor rather than $C_s$ sets the snubber’s impedance — but every picofarad of $C_s$ is charged and discharged each cycle, so it costs power. Todd recommends $C_s$ of three to four times $C_p$; SLVA255 uses the next standard value above $C_{add}$, about $3C_p$. Here $R_s = k Z_0$ and $C_s = n C_p$ with $k$ and $n$ as inputs (defaults 1 and 4).</p>
<p>With $\\omega_0 = 1/\\sqrt{L_pC_p}$ and $x = s/\\omega_0$, a voltage step through $L_p$ into $C_p \\parallel (R_s + C_s)$ gives</p>
$$\\frac{V_{node}}{V}(x) = \\frac{1 + k n x}{k n x^3 + (1+n)x^2 + k n x + 1}$$
<p>so the damping depends only on $k$ and $n$. The page evaluates the step response exactly from the three poles and reports the peak overshoot (100 % for a lossless loop without a snubber). With $n = 4$, the overshoot is lowest for $R_s$ a little below $Z_0$; the overshoot-vs-$R_s$ graph shows the optimum for your $n$.</p>`,
    },
    {
      title: 'Resistor power',
      html: `<p>Stepping a capacitor through a resistor by $V$ dissipates $\\tfrac12 C_s V^2$ in the resistance, whatever its value. How many such steps occur per cycle depends on the node:</p>
<ul>
<li><strong>Inductive, hard-switched node</strong> (buck or boost switch node, the default): only the edge driven by the switch is a hard step. On the other edge the inductor current commutates the node and recharges $C_s$ almost without loss, returning most of the stored energy. Then $P_R \\approx \\tfrac12 C_s V^2 f_{sw}$, the figure TI SLVA255 uses.</li>
<li><strong>Both edges hard</strong> (or as a conservative bound): $P_R = C_s V^2 f_{sw}$, as in Todd’s seminar.</li>
</ul>
<p>The page shows the chosen estimate as $P_R$ and the other one beside it, and suggests a resistor rated for twice $P_R$. At the hard edge part of the $\\tfrac12 C_s V^2$ is dissipated in the switch channel rather than in $R_s$, so a snubber also adds to the switch’s turn-on loss. The resistor sees a short pulse of $V^2/R_s$ at each hard edge: pick a part rated for pulses.</p>`,
    },
    {
      title: 'Solve for',
      html: `<ul>
<li><strong>Design</strong> (default): $R_s = kZ_0$, $C_s = nC_p$ and the resulting power and overshoot.</li>
<li><strong>Power budget</strong>: type the power the resistor may dissipate; the largest $C_s = P_R/(V^2 f_{sw})$ follows, with $R_s = kZ_0$, and the page shows how well that $C_s$ damps.</li>
<li><strong>Analysis</strong>: type the parts you have; the page reports $n$, $k$, the power and the overshoot.</li>
</ul>
<p>The Tables tab lists the nearest standard values (E-series) and the overshoot and power each combination gives.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Measure with a probe and scope of at least twice the ring frequency and a ground spring at the probe tip; a long ground lead adds its own ringing.</li>
<li>Place the snubber right at the device pins: the snubber loop’s own inductance must be small compared with $L_p$.</li>
<li>Use a C0G/NP0 capacitor rated above the peak voltage; Class-II ceramics lose capacitance with voltage and heat.</li>
<li>The RC time constant should be short compared with the shortest on/off time; otherwise $C_s$ never settles and the snubber works less well.</li>
<li>A snubber treats the symptom. A tighter layout (smaller $L_p$) raises $f_0$ and $Z_0$ and reduces the energy that needs damping; at high voltage, an RCD clamp or a lossless snubber may be the better choice.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>J. Falin, “Minimizing Ringing at the Switch Node of a Boost Converter,” Texas Instruments SLVA255, 2006 — two-measurement method, eq. 1–3 and the 217 MHz / 300 pF example.</li>
<li>P. C. Todd, “Snubber Circuits: Theory, Design and Application,” Unitrode Power Supply Design Seminar SEM-900, 1993 (TI SLUP100).</li>
<li>R. W. Erickson and D. Maksimović, <em>Fundamentals of Power Electronics</em>, 3rd ed., Springer, 2020 — switching loss and ringing in converters (ch. 4).</li>
<li>N. Mohan, T. Undeland, W. Robbins, <em>Power Electronics</em>, 3rd ed., Wiley, 2003 — snubber circuits (ch. 27).</li>
</ol>`,
    },
  ],
};
