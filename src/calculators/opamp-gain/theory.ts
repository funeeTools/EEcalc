import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Op-amp gain stages — how this calculator works',
    lead:
      'With negative feedback, an op-amp’s gain is set by two resistors rather than by the op-amp itself. Only as long as the open-loop gain is large, though, and it falls with frequency. This page sizes the resistors for the inverting, non-inverting and difference configurations. It then uses a single-pole op-amp model to show what is left of the ideal gain: the DC error, the closed-loop bandwidth, the phase shift, the slew-rate limit, and the common-mode rejection of the difference amplifier.',
  },
  sections: [
    {
      title: 'Ideal gain',
      html: `<p>With infinite open-loop gain, the op-amp forces its two inputs to the same voltage. For the three configurations this gives:</p>
$$G_{non\\text{-}inv} = 1 + \\frac{R_f}{R_{in}},\\qquad G_{inv} = -\\frac{R_f}{R_{in}},\\qquad G_{diff} = \\frac{R_f}{R_{in}}\\;(V_2 - V_1)$$
<p>The difference amplifier also needs $R_3 = R_{in}$ from $V_2$ to the + input and $R_4 = R_f$ from the + input to ground. Solving for $R_f$ or $R_{in}$ uses the exact inverses ($R_f = R_{in}(G-1)$ for the non-inverting stage, $R_f = R_{in}G$ for the others), so a solved value reproduces the target gain exactly.</p>
<p>All three circuits share the same <strong>noise gain</strong>, which is the gain the op-amp sees from its own input error to the output:</p>
$$NG = \\frac{1}{\\beta} = 1 + \\frac{R_f}{R_{in}}$$
<p>For the non-inverting stage NG equals the signal gain. For a unity-gain inverter it is 2. NG, not the signal gain, sets the bandwidth and the DC error.</p>`,
    },
    {
      title: 'Finite gain and bandwidth (single-pole model)',
      html: `<p>Most voltage-feedback op-amps are internally compensated to behave like a single pole up to their unity-gain frequency:</p>
$$A(s) = \\frac{A_{OL}}{1 + s/\\omega_p},\\qquad f_p = \\frac{GBW}{A_{OL}}$$
<p>The general feedback result $A/(1 + A\\beta)$ then gives, for the non-inverting stage (the inverting and difference stages carry an extra factor $R_f/(R_{in}+R_f)$ with the sign of the configuration):</p>
$$G(f) = \\frac{A_{OL}}{1 + A_{OL}\\beta}\\cdot\\frac{1}{1 + jf/f_c},\\qquad f_c = f_p\\,(1 + A_{OL}\\beta) = \\frac{GBW}{A_{OL}} + \\frac{GBW}{NG} \\approx \\frac{GBW}{NG}$$
<p>So the closed loop is again a single pole. Its consequences:</p>
<ul>
<li><strong>DC gain error</strong> $\\approx -NG/A_{OL}$. With 100 dB of open-loop gain, a gain of 1000 loses 1 %.</li>
<li><strong>Bandwidth</strong> $f_{-3dB} \\approx GBW/NG$, with a 10–90 % step rise time of $0.35/f_{-3dB}$.</li>
<li><strong>Gain error at a frequency</strong> $f$: $|G| = G_0/\\sqrt{1 + (f/f_c)^2}$. Holding the error below 1 % needs $f_c \\ge 7.0\\,f$, so a good rule is $GBW \\ge 7\\,f\\,NG$. A stage whose −3 dB point sits right at the top of the band already loses 29 % there.</li>
</ul>
<p>The Bode plot shows the classic picture: the closed-loop gain follows the noise-gain line until it meets the open-loop curve, then falls at −20 dB/decade with it. Real op-amps have more poles above the crossover. Near unity noise gain that causes peaking, and decompensated parts are not stable there at all, so the single-pole model is optimistic for NG < 2.</p>`,
    },
    {
      title: 'Slew rate and full-power bandwidth',
      html: `<p>For large signals, the output cannot change faster than the slew rate SR. A sine of peak amplitude $V_{pk}$ has a maximum slope of $2\\pi f V_{pk}$, so it is undistorted only below</p>
$$f_{FP} = \\frac{SR}{2\\pi V_{pk}}$$
<p>The LM358 is a good example: with 0.3 V/µs it can deliver a 1 V peak sine only up to about 48 kHz, whatever its small-signal bandwidth.</p>`,
    },
    {
      title: 'Difference amplifier: CMRR from resistor matching',
      html: `<p>Write the two resistor ratios as $x = R_4/R_3$ and $y = R_f/R_{in}$. Superposition gives</p>
$$V_{out} = V_2\\,\\frac{x(1+y)}{1+x} - V_1\\,y,\\qquad A_{cm} = \\frac{x - y}{1 + x}$$
<p>which is zero only when $x = y$. If every resistor is within $\\pm t$, the ratios can be pushed apart to $x = G(1+t)/(1-t)$ and $y = G(1-t)/(1+t)$, so $x - y \\approx 4tG$. The worst-case rejection is then</p>
$$CMRR \\approx \\frac{1 + G}{4t}$$
<p>This is 54 dB for $G = 20$ with 1 % resistors, and only 34 dB at unity gain. The page evaluates the exact expression. Matched networks and integrated difference amplifiers (laser-trimmed to 0.01 %) are the usual cure. The op-amp’s own CMRR adds to this and is not included.</p>`,
    },
    {
      title: 'Impedances and noise',
      html: `<ul>
<li><strong>Input impedance.</strong> Non-inverting: the op-amp input itself (MΩ to TΩ). Inverting: $R_{in}$, because the − input is a virtual ground. Difference: $2R_{in}$ between the inputs, and $R_{in}+R_f$ from $V_2$ to ground. The two inputs are not equally loaded.</li>
<li><strong>Bias-current balance.</strong> With bipolar input op-amps, a resistor $R_f \\parallel R_{in}$ in series with the + input makes the two bias-current drops equal, so only the offset current matters.</li>
<li><strong>Resistor noise.</strong> Thermal noise $\\sqrt{4kTR}$ of the two resistors gives an output density of $\\sqrt{4kT R_f\\, NG}$ (twice the power for the difference amplifier, which has a second pair). Referred to the input it is $\\sqrt{4kT(R_f \\parallel R_{in})}$ for the non-inverting stage. Lower resistor values mean less noise but more load on the output.</li>
</ul>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Resistor range.</strong> 1 kΩ – 100 kΩ suits most stages. Much lower values load the output and the source. Much higher values add noise, bias-current error, and a pole from a few pF of stray capacitance across $R_f$.</li>
<li><strong>Split high gains.</strong> Two stages of ×31.6 have far more bandwidth than one stage of ×1000 ($GBW/31.6$ versus $GBW/1000$).</li>
<li><strong>Output swing.</strong> The model has no supply rails. Check the datasheet output swing, and the input common-mode range for the non-inverting and difference stages.</li>
<li><strong>Capacitive loads</strong> and the second pole erode phase margin. If you need to drive cable or ADC inputs, add an isolation resistor.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. Franco, <em>Design with Operational Amplifiers and Analog Integrated Circuits</em>, 4th ed., McGraw-Hill, 2015: ch. 1 (basic configurations, finite open-loop gain, noise gain), ch. 2 (difference amplifier and CMRR with resistor mismatch), ch. 6 (closed-loop bandwidth of a dominant-pole op-amp, slew rate, full-power bandwidth).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., 2015, ch. 4 (op-amp basics) and ch. 8 (resistor thermal noise, $\\sqrt{4kTR}$).</li>
<li>Texas Instruments datasheets (typical values at 25 °C): LM358 (SLOS068AB), TL07xH (SLOS080W; A_OL = 120 dB typ. with R_L = 2 kΩ), NE5532 (SLOS075K: unity-gain bandwidth 12 MHz and slew rate 5 V/µs in its electrical table; earlier revisions give 10 MHz and 9 V/µs), OPA2134 (SBOS058B).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
