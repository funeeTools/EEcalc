import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Schmitt trigger oscillator — how this calculator works',
    lead:
      'A Schmitt trigger has two input thresholds, so an inverting one with a resistor from its output back to a capacitor on its input oscillates by itself: the capacitor charges until it crosses the upper threshold, the output flips and discharges it to the lower threshold, and so on. This page computes the frequency and duty cycle of that RC relaxation oscillator built from a logic Schmitt inverter (74HC14, 74LVC1G14, with the thresholds from their data sheets) or from an op-amp Schmitt trigger, and solves R or C for a target frequency.',
  },
  sections: [
    {
      title: 'Thresholds',
      html: `<p><strong>Logic gates.</strong> A Schmitt-input gate switches its output when the input rises past $V_{T+}$ and switches back when it falls below $V_{T-}$. Both depend on the supply and vary widely from part to part. The TI data sheets tabulate them at a few supply voltages: the 74HC14 at 2, 4.5 and 6 V (minimum, typical and maximum), the 74LVC1G14 at 1.65 to 5.5 V (minimum and maximum only). Between rows the page interpolates linearly.</p>
<p><strong>Op-amp.</strong> In the inverting Schmitt trigger the + input sits on a divider between the output (through $R_2$) and a reference $V_{ref}$ (through $R_1$). With the output saturated at $V_{OH}$ or $V_{OL}$ and $\\beta = R_1/(R_1+R_2)$:</p>
$$V_{TH} = V_{ref} + \\beta\\,(V_{OH} - V_{ref}),\\qquad V_{TL} = V_{ref} + \\beta\\,(V_{OL} - V_{ref})$$`,
    },
    {
      title: 'Oscillation period',
      html: `<p>A capacitor charging through $R$ from $V_1$ towards a source $V_S$ reaches $V_2$ after $t = RC\\ln\\big[(V_S - V_1)/(V_S - V_2)\\big]$. While the output is high, C charges from $V_{TL}$ towards $V_{OH}$ until it reaches $V_{TH}$; while it is low, C discharges from $V_{TH}$ towards $V_{OL}$ until $V_{TL}$:</p>
$$t_H = RC\\,\\ln\\frac{V_{OH} - V_{TL}}{V_{OH} - V_{TH}},\\qquad t_L = RC\\,\\ln\\frac{V_{TH} - V_{OL}}{V_{TL} - V_{OL}},\\qquad f = \\frac{1}{t_H + t_L}$$
<p>For a CMOS gate ($V_{OH} = V_{CC}$, $V_{OL} = 0$):</p>
$$f = \\frac{1}{RC\\,\\ln\\left[\\dfrac{V_{T+}\\,(V_{CC} - V_{T-})}{V_{T-}\\,(V_{CC} - V_{T+})}\\right]}$$
<p>For an op-amp with symmetric saturation levels and $V_{ref} = 0$ the two halves are equal and the period reduces to the textbook astable multivibrator, $T = 2RC\\ln\\big[(1+\\beta)/(1-\\beta)\\big]$; with $R_1 = R_2$ this is $2RC\\ln 3 \\approx 2.2\\,RC$.</p>
<p>The duty cycle is $t_H/(t_H+t_L)$. It is set by where the thresholds sit between the output levels, not by $R$ or $C$: 50 % only when they are centred. After power-up the capacitor starts at 0 V, so the first half-period is longer.</p>`,
    },
    {
      title: 'Spread over the data-sheet window',
      html: `<p>The period factor $k = (t_H + t_L)/RC$ depends only on the thresholds. The page searches the data-sheet window ($V_{T+}$ between its minimum and maximum, $V_{T-}$ likewise, and their difference within the $\\Delta V_T$ limits) for the smallest and largest $k$ and reports the resulting frequency range. For a 74HC14 at 5 V this is roughly a factor of three, which is why Schmitt RC oscillators suit blinkers, debouncers and clock-ish signals, not anything that needs an accurate frequency.</p>`,
    },
    {
      title: 'Solving for R or C',
      html: `<p>The period is $k\\cdot RC$, so $R = 1/(f\\,C\\,k)$ and $C = 1/(f\\,R\\,k)$ exactly, using the same thresholds as the analysis. The nearest standard values on both sides of the answer are listed with the frequency they give.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Output loading.</strong> The gate charges C through R; at each edge it supplies about $V_{CC}/R$. Data sheets specify $V_{OH}$ and $V_{OL}$ at a few mA (74HC14: 4 mA at 4.5 V). Keep R above about 1–2 kΩ so the levels stay at the rails.</li>
<li><strong>Delays and strays.</strong> Each edge is late by the propagation delay (74HC14: about 12 ns at 4.5 V), and pin capacitance (3–10 pF) adds to C. Keep C ≥ 100 pF and the period above a few hundred delays.</li>
<li><strong>Leakage.</strong> Input leakage (74HC14: up to 1 µA over temperature) flows in R, so very large R shifts the timing. Prefer R ≤ 1 MΩ and a larger C.</li>
<li><strong>Op-amps.</strong> Most op-amps do not swing to the rails, are slow to come out of saturation and slew at only a few V/µs, so above a few kHz a comparator is the better Schmitt trigger. Enter the slew rate to see its effect.</li>
<li><strong>Capacitor.</strong> C0G/NP0 ceramics and film capacitors are stable; X7R loses capacitance with bias and temperature, electrolytics leak.</li>
<li><strong>Spare gates.</strong> Tie unused Schmitt inputs to a rail; a floating CMOS input draws current and can oscillate.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>Texas Instruments, <em>SN74HC14 Hex Schmitt-Trigger Inverters</em>, data sheet SCLS085L, rev. Feb. 2025 (§5.5 thresholds, §5.7 switching).</li>
<li>Texas Instruments, <em>SN74LVC1G14 Single Schmitt-Trigger Inverter</em>, data sheet SCES218AA, rev. Oct. 2025 (§5.5).</li>
<li>Fairchild Semiconductor, <em>CMOS Oscillators</em>, Application Note AN-118.</li>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015, ch. 18 (bistable and astable multivibrators).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.4 (RC charging) and §7.1 (relaxation oscillators).</li>
</ul>`,
    },
  ],
};
