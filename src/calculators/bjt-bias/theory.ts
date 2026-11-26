import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'BJT bias point — how this calculator works',
    lead:
      'A bipolar transistor used as an amplifier needs a steady (quiescent) collector current and enough collector–emitter voltage to swing around it. This page finds that bias point for the three classic networks — voltage divider with emitter resistor, fixed base resistor, and collector feedback — tells you whether the transistor is active, saturated or off, shows how far the point moves over the datasheet β spread and with temperature, and can design the resistors for a target I_C and V_CE.',
  },
  sections: [
    {
      title: 'Large-signal model',
      html: `<p>When the base–emitter junction conducts, its voltage barely changes with current, so it is modelled as a fixed drop $V_{BE}$ (about 0.6–0.7 V for small silicon transistors at around 1 mA). Then three regions:</p>
<ul>
<li><strong>Active:</strong> $I_C = \\beta I_B$, $I_E = (\\beta+1)I_B$, and $V_{CE} > V_{CE(sat)}$.</li>
<li><strong>Saturation:</strong> the collector cannot take $\\beta I_B$; $V_{CE}$ sits at $V_{CE(sat)}$ (0.1–0.3 V) and the forced gain $I_C/I_B$ is below β.</li>
<li><strong>Cutoff:</strong> the base cannot reach $V_{BE}$; no current flows.</li>
</ul>
<p>The Early effect (output conductance) and the leakage current $I_{CBO}$ are ignored; at these bias currents they shift the point by a few percent at most.</p>`,
    },
    {
      title: 'The three bias networks',
      html: `<p><strong>Voltage divider + R<sub>E</sub>.</strong> Replace the divider by its Thévenin equivalent $V_{BB} = V_{CC}R_2/(R_1+R_2)$, $R_B = R_1\\parallel R_2$. The base–emitter loop gives</p>
$$I_B = \\frac{V_{BB} - V_{BE}}{R_B + (\\beta+1)R_E},\\qquad I_C = \\beta I_B,\\qquad V_{CE} = V_{CC} - I_CR_C - I_ER_E$$
<p><strong>Fixed bias</strong> is the same with $V_{BB} = V_{CC}$ and $R_B$ the single base resistor. With $R_E = 0$, $I_C = \\beta(V_{CC}-V_{BE})/R_B$: directly proportional to β.</p>
<p><strong>Collector feedback</strong> takes the base current from the collector, so a rising $I_C$ lowers $V_C$ and with it the base drive. $R_C$ carries $I_C + I_B$:</p>
$$I_B = \\frac{V_{CC} - V_{BE}}{R_B + (\\beta+1)(R_C + R_E)}$$
<p>Here $V_{CB} = I_BR_B \\ge 0$, so this circuit can never saturate.</p>
<p>If the active-region answer gives $V_{CE} < V_{CE(sat)}$, the page solves the saturated circuit instead: both loops with $V_{CE} = V_{CE(sat)}$,</p>
$$V_{BB}-V_{BE} = I_B(R_B+R_E) + I_CR_E,\\qquad V_{CC}-V_{CE(sat)} = I_BR_E + I_C(R_C+R_E)$$
<p><strong>PNP</strong> transistors are drawn with the emitter towards $V_{CC}$. Measured downwards from $V_{CC}$ the circuit is the NPN one with $R_1$ and $R_2$ exchanged, so the same equations apply to the magnitudes; the page then reports the real node voltages.</p>`,
    },
    {
      title: 'Stability against β and temperature',
      html: `<p>Write the base-side resistance as $R_x$ ($R_B$) and the emitter-side as $R_y$ ($R_E$, or $R_C+R_E$ with collector feedback). Then $I_C = \\beta(V-V_{BE})/(R_x+(\\beta+1)R_y)$ and</p>
$$S_\\beta = \\frac{\\beta}{I_C}\\frac{\\partial I_C}{\\partial \\beta} = \\frac{R_x + R_y}{R_x + (\\beta+1)R_y},\\qquad \\frac{\\partial I_C}{\\partial T} = -\\frac{\\beta}{R_x + (\\beta+1)R_y}\\,\\frac{dV_{BE}}{dT}$$
<p>$S_\\beta$ is the fraction of a relative β change that reaches $I_C$: 1 for fixed bias without $R_E$, near 0 for a stiff divider with $(\\beta+1)R_E \\gg R_B$. The classical leakage stability factor is $S = (\\beta+1)S_\\beta$. $V_{BE}$ falls by about 2 mV/°C, so a larger voltage across $R_E$ swamps the drift: with $V_E$ = 1 V, 50 °C of warming (−0.1 V) moves $I_C$ by about 10 %.</p>
<p>The page also recomputes the full bias point at the datasheet minimum and maximum $h_{FE}$ and lists it in the Tables tab; that catches a design that saturates with a high-gain part.</p>`,
    },
    {
      title: 'Designing the resistors',
      html: `<p>Choose the collector current, the collector–emitter voltage, the emitter voltage $V_E$ (a common rule is about $V_{CC}/10$, at least 1 V) and, for the divider, the current in $R_2$ as a multiple $k$ of $I_B$ (10 is usual). Then, with the design β:</p>
$$R_E = \\frac{V_E}{I_E},\\quad R_C = \\frac{V_{CC}-V_{CE}-V_E}{I_C},\\quad R_2 = \\frac{V_E+V_{BE}}{kI_B},\\quad R_1 = \\frac{V_{CC}-V_E-V_{BE}}{(k+1)I_B}$$
<p>Fixed bias: $R_B = (V_{CC}-V_E-V_{BE})/I_B$. Collector feedback: $R_C = (V_{CC}-V_{CE}-V_E)/(I_C+I_B)$, $R_B = (V_{CE}-V_{BE})/I_B$. These are exact for the model, so the analysis of the exact values returns the targets. The page then rounds each resistor to the nearest standard value and re-analyses the circuit with those parts.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Bias for swing.</strong> For maximum symmetrical swing put $V_C$ roughly midway between $V_E + V_{CE(sat)}$ and $V_{CC}$.</li>
<li><strong>Stiff, not too stiff.</strong> A smaller divider makes $I_C$ independent of β but loads the signal source and wastes current; $(\\beta+1)R_E \\approx 10R_B$ is the usual compromise.</li>
<li><strong>Bypass R<sub>E</sub> for gain.</strong> A capacitor across $R_E$ restores the AC gain $-g_mR_C$ without losing the DC stability; leave part of $R_E$ unbypassed for linearity.</li>
<li><strong>h<sub>FE</sub> is not a constant.</strong> It varies with collector current, $V_{CE}$ and temperature (rising roughly 0.5–1 %/°C), and the datasheet spread is often 3:1. Design so the bias point does not depend on it.</li>
<li><strong>Power.</strong> $P_D \\approx V_{CE}I_C$; TO-92 parts are rated about 625 mW at 25 °C, derated 5 mW/°C.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015: ch. 6 (BJT modes, DC analysis, the voltage-divider bias example with $V_{CC}$ = 15 V, 100 kΩ/50 kΩ, $R_E$ = 3 kΩ, $R_C$ = 5 kΩ, β = 100) and §7.4 (biasing).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015: §2.2 (biasing, emitter degeneration, the transistor switch).</li>
<li>onsemi datasheets: 2N3903/2N3904, P2N2222A, BC546/BC547/BC548, 2N3906, BC556B/BC557/BC558.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
