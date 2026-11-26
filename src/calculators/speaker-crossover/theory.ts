import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Passive two-way crossovers — how this calculator works',
    lead:
      'A passive crossover sits between the amplifier and the drivers: a low-pass ladder feeds the woofer and a high-pass ladder feeds the tweeter. This page sizes both ladders for a chosen alignment (Butterworth or Linkwitz–Riley) with each driver treated as a resistor, then computes the actual responses, their acoustic sum for the chosen tweeter polarity, and the load the amplifier sees, from the parts themselves.',
  },
  sections: [
    {
      title: 'Element values',
      html: `<p>Each section is a ladder driven by the amplifier (an ideal voltage source) and terminated in the driver resistance $R$. For the low-pass ladder series $L_1$, shunt $C_1$, series $L_2$, shunt $C_2$, normalised to $R = 1$ and $\\omega_c = 1$ with element values $g_1 \\dots g_4$, nodal analysis gives</p>
$$\\frac{V_{in}}{V_{out}} = 1 + (g_1+g_3)s + (g_1g_2 + g_1g_4 + g_3g_4)s^2 + g_1g_2g_3\\,s^3 + g_1g_2g_3g_4\\,s^4$$
<p>(drop the missing terms for lower orders). Matching it to the target denominator gives the $g$ values:</p>
<table class="kv" style="max-width:640px"><tbody>
<tr><th>Alignment</th><th>Denominator</th><th>$g_1, g_2, g_3, g_4$</th><th>Each section at $f_c$</th></tr>
<tr><td>1st order</td><td>$s+1$</td><td>1</td><td>−3 dB</td></tr>
<tr><td>2nd Butterworth</td><td>$s^2+\\sqrt2 s+1$</td><td>1.4142, 0.7071</td><td>−3 dB</td></tr>
<tr><td>2nd Linkwitz–Riley</td><td>$(s+1)^2$</td><td>2, 0.5</td><td>−6 dB</td></tr>
<tr><td>3rd Butterworth</td><td>$(s+1)(s^2+s+1)$</td><td>1.5, 1.3333, 0.5</td><td>−3 dB</td></tr>
<tr><td>4th Linkwitz–Riley</td><td>$(s^2+\\sqrt2 s+1)^2$</td><td>1.8856, 1.5910, 0.9428, 0.3536</td><td>−6 dB</td></tr>
</tbody></table>
<p>De-normalising at $\\omega_c = 2\\pi f_c$: low-pass series $L = gR/\\omega_c$, shunt $C = g/(R\\omega_c)$. The high-pass section is the $s \\to 1/s$ dual: series $C = 1/(gR\\omega_c)$, shunt $L = R/(g\\omega_c)$. For example, a 2nd-order Linkwitz–Riley section is $L = 0.3183\\,R/f_c$, $C = 0.0796/(R f_c)$, and the 4th-order low-pass is $L_1 = 0.3001\\,R/f_c$, $C_1 = 0.2533/(Rf_c)$, $L_2 = 0.1500\\,R/f_c$, $C_2 = 0.0563/(Rf_c)$ — the familiar published tables.</p>`,
    },
    {
      title: 'Summing and tweeter polarity',
      html: `<p>With $H_{LP}$ and $H_{HP}$ the normalised section responses, the on-axis acoustic sum of ideal coincident drivers is $H_{LP} \\pm H_{HP}$, the sign set by the tweeter polarity:</p>
<ul>
<li><strong>1st order:</strong> $\\frac{1}{s+1} + \\frac{s}{s+1} = 1$. Normal polarity reconstructs the input exactly. (Inverted gives the all-pass $\\frac{1-s}{1+s}$, also flat in magnitude.)</li>
<li><strong>2nd-order Linkwitz–Riley:</strong> $\\frac{1 - s^2}{(s+1)^2} = \\frac{1-s}{1+s}$ with the tweeter <em>inverted</em>: an all-pass, flat magnitude. In normal polarity the sections are 180° apart and cancel to a deep null at $f_c$.</li>
<li><strong>2nd-order Butterworth:</strong> also 180° apart, so the tweeter is inverted; the sum is then $+3$ dB at $f_c$ (the sections are −3 dB each and in phase). The <em>power</em> response is flat, which is why it was used in the past.</li>
<li><strong>3rd-order Butterworth:</strong> the sections are 90° apart at $f_c$; either polarity gives a flat all-pass sum ($\\frac{s^2-s+1}{s^2+s+1}$ normal, $\\frac{1-s}{1+s}$ inverted). The choice tilts the vertical lobe up or down.</li>
<li><strong>4th-order Linkwitz–Riley:</strong> $\\frac{1+s^4}{(s^2+\\sqrt2s+1)^2} = \\frac{s^2-\\sqrt2s+1}{s^2+\\sqrt2s+1}$ with <em>normal</em> polarity: all-pass, flat; the sections are 360° apart.</li>
</ul>
<p>Linkwitz–Riley crossovers keep the sections in phase at $f_c$ (after the polarity choice) at every order, so the vertical lobe points forward and the on-axis sum is flat (Linkwitz, 1976). The calculator’s “Recommended” polarity applies these rules; the dashed curve shows the other choice.</p>`,
    },
    {
      title: 'Amplifier load and L-pad',
      html: `<p>The two sections are in parallel at the amplifier terminals, so the load is $Z = (Z_{LP}^{-1} + Z_{HP}^{-1})^{-1}$, each $Z$ computed from the ladder’s ABCD matrix into $R$. With exact parts and equal resistive drivers, the 1st-order, 2nd-order Butterworth and 3rd-order Butterworth networks are constant-resistance: $|Z| = R$ at every frequency. The Linkwitz–Riley networks are not: their load is $R$ far from $f_c$ and rises to a peak of $2R$ at $f_c$, so the amplifier never sees less than about $R$. Rounded parts and unequal driver impedances move these values; the graph shows the actual load.</p>
<p>A tweeter is usually more sensitive than the woofer. An L-pad with series $R_s = R(1-k)$ and parallel $R_p = Rk/(1-k)$, $k = 10^{-A/20}$, attenuates by $A$ dB while still presenting $R$ to the filter, so the filter values do not change.</p>`,
    },
    {
      title: 'What the model leaves out',
      html: `<ul>
<li><strong>Drivers are not resistors.</strong> Voice-coil inductance raises a woofer’s impedance with frequency, which shifts a low-pass corner down and its Q up. A Zobel network (series $R \\approx R_e$, $C \\approx L_e/R_e^2$ across the woofer) flattens it so these values work.</li>
<li><strong>Acoustic, not electrical, slopes matter.</strong> The drivers’ own roll-offs add to the filter slopes, and their acoustic centres are offset (the tweeter is usually ahead), which adds delay. A textbook electrical alignment rarely gives the textbook acoustic sum; measure and adjust.</li>
<li><strong>Part tolerance and DCR.</strong> ±5–10 % parts move the crossover point by a similar fraction. Inductor DCR lowers the woofer level and damping, worst at low $f_c$.</li>
<li><strong>Lower crossovers need big parts.</strong> Below a few hundred hertz the inductors become large and lossy; active crossovers are then the norm.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. H. Linkwitz, “Active crossover networks for noncoincident drivers,” <em>J. Audio Eng. Soc.</em>, 24(1), pp. 2–8, 1976.</li>
<li>R. H. Small, “Constant-voltage crossover network design,” <em>J. Audio Eng. Soc.</em>, 19(1), pp. 12–19, 1971.</li>
<li>R. M. Bullock III, “Passive crossover networks,” <em>Speaker Builder</em>, parts 1–2, 1985 (element-value tables for Butterworth and Linkwitz–Riley alignments).</li>
<li>V. Dickason, <em>The Loudspeaker Design Cookbook</em>, 7th ed., Audio Amateur Press (passive crossover networks, L-pads, Zobel networks).</li>
</ul>`,
    },
  ],
};
