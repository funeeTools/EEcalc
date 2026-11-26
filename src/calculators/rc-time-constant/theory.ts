import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'RC time constant — how this calculator works',
    lead:
      'A resistor feeding a capacitor is the simplest circuit with memory. After a voltage step the capacitor voltage moves exponentially from where it was towards where the source is pulling it, with one time scale, $\\tau = RC$. This page gives the full step response (charge or discharge between any two voltages), the time to cross a threshold, and the matching frequency-domain view: the same $RC$ is a single-pole low-pass or high-pass filter with its corner at $1/2\\pi RC$.',
  },
  sections: [
    {
      title: 'Step response',
      html: `<p>Kirchhoff’s voltage law around the loop, with $i = C\\,dv/dt$, gives the first-order equation $RC\\,\\dfrac{dv}{dt} + v = V_\\infty$. With the capacitor at $V_0$ when the step is applied ($t = 0$), its solution is</p>
$$v(t) = V_\\infty + (V_0 - V_\\infty)\\,e^{-t/\\tau},\\qquad \\tau = RC$$
<p>and the current is $i(t) = \\dfrac{V_\\infty - V_0}{R}\\,e^{-t/\\tau}$. A plain charge from 0 V is the special case $V_0 = 0$: $v = V_\\infty(1-e^{-t/\\tau})$; a discharge to ground is $V_\\infty = 0$: $v = V_0e^{-t/\\tau}$. The same expression covers a capacitor that starts part-charged, or a step between two arbitrary rails.</p>
<p>After one time constant the voltage has covered $1 - e^{-1} = 63.2\\ \\%$ of the step; after 3τ 95.0 %, after 5τ 99.3 %. It never quite arrives, which is why a threshold close to $V_\\infty$ is a poor timing reference.</p>`,
    },
    {
      title: 'Time to reach a threshold',
      html: `<p>Solving the step response for $t$ gives the time at which the voltage crosses $V_{th}$:</p>
$$t = \\tau\\,\\ln\\frac{V_0 - V_\\infty}{V_{th} - V_\\infty}$$
<p>It exists only when $V_{th}$ lies between $V_0$ and $V_\\infty$. Some useful special values: 50 % at $\\tau\\ln 2 = 0.693\\,\\tau$; 90 % at $\\tau\\ln 10 = 2.303\\,\\tau$; and the 10–90 % rise time $t_r = \\tau\\ln 9 = 2.197\\,\\tau$.</p>
<p>The energy taken from the source during a full charge is $C\\,V_\\infty(V_\\infty - V_0)$; the capacitor keeps $\\tfrac12 C(V_\\infty^2 - V_0^2)$ and the resistor dissipates $\\tfrac12 C (V_\\infty - V_0)^2$ — whatever the value of $R$. So charging a capacitor from a voltage source through any resistor is exactly 50 % efficient from 0 V, and $(V_\\infty + V_0)/(2V_\\infty)$ efficient in general.</p>`,
    },
    {
      title: 'Frequency response',
      html: `<p>Driven by a sine wave, the same network is a single-pole filter. Taking the output across $C$ gives a low-pass, across $R$ a high-pass:</p>
$$H_{LP} = \\frac{1}{1 + j f/f_c},\\qquad H_{HP} = \\frac{j f/f_c}{1 + j f/f_c},\\qquad f_c = \\frac{1}{2\\pi RC}$$
<p>At $f_c$ both responses are 3.01 dB down with ±45° phase shift; far from it they roll off at 20 dB per decade. Rise time and bandwidth are tied together: $t_r \\cdot f_c = \\ln 9 / 2\\pi \\approx 0.35$, the familiar rule for any single-pole system.</p>`,
    },
    {
      title: 'Solving for R, C, τ or the threshold',
      html: `<p>Click the ◎ beside a value to make it the unknown:</p>
<ul>
<li><strong>t</strong> — time to reach $V_{th}$ from the given $R$ and $C$ (τ is computed).</li>
<li><strong>V_th</strong> — the capacitor voltage at the given time $t$.</li>
<li><strong>R</strong> or <strong>C</strong> — the part needed for a design target, the other part given. The target is either “reach $V_{th}$ at time $t$” (then $\\tau = t/\\ln[(V_0 - V_\\infty)/(V_{th} - V_\\infty)]$) or the time constant itself (click ◎ on the green τ to type it).</li>
</ul>
<p>All inversions are exact rearrangements of the step response, so a solved value typed back in reproduces the target. A solved R or C is also rounded to the nearest preferred value of the chosen E-series, with the timing it actually gives.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Include every resistance.</strong> The driver’s output resistance, a series LED or a switch’s on-resistance all add to $R$; the capacitor’s ESR matters only when $R$ is a few ohms.</li>
<li><strong>Use the real capacitance.</strong> Class-2 ceramics (X5R, X7R) can lose 50–80 % of their capacitance at rated DC bias, Y5V/Z5U ceramics are often specified −20 %/+80 %, and aluminium electrolytics are typically ±20 %. For timing better than ~10 %, use C0G/NP0 ceramic or film capacitors.</li>
<li><strong>Loads change both τ and V∞.</strong> A resistor $R_L$ across the capacitor (an ADC input, a bleeder, a comparator’s input network) makes the Thévenin source $V_\\infty R_L/(R + R_L)$ with resistance $R\\|R_L$.</li>
<li><strong>Avoid thresholds near V∞.</strong> Beyond about 3τ the slope is small, so leakage, supply drift and comparator offset turn into large timing errors. Many reset and delay circuits deliberately cross at 50–70 %.</li>
<li><strong>Very large R.</strong> Above a few MΩ, capacitor leakage, board contamination and the bias current of the circuit reading the node start to rival the charging current.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, ch. 7 (first-order circuits: natural and step response of RC circuits).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.4 (RC circuits: V and I versus time) and §1.7 (RC filters).</li>
<li>J. W. Nilsson, S. A. Riedel, <em>Electric Circuits</em>, 10th ed., Pearson, 2015, ch. 7 (response of first-order RL and RC circuits).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em> (E-series).</li>
</ul>`,
    },
  ],
};
