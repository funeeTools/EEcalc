import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Op-amp bandwidth — how this calculator works',
    lead:
      'A voltage-feedback op-amp trades gain for bandwidth: its gain-bandwidth product (GBW) divided by the noise gain gives the closed-loop small-signal bandwidth. For large signals the slew rate sets a second, independent limit, the full-power bandwidth. This page computes both, takes the lower one for your output swing, adds rise time, phase margin and peaking when the data-sheet phase margin is known, shows how bandwidth shrinks when identical stages are cascaded, and solves for the GBW, gain or slew rate a target bandwidth needs. (For resistor values, gain error and noise of one stage, use the Op-Amp Gain page.)',
  },
  sections: [
    {
      title: 'Small-signal bandwidth and noise gain',
      html: `<p>With a single dominant pole the open-loop gain is $A(f) = A_{OL}/(1 + jf/f_1)$ with $f_1 = \\mathrm{GBW}/A_{OL}$. Feedback with factor $\\beta$ (the fraction of the output fed back) gives</p>
$$f_{-3\\,dB} = f_1\\,(1 + A_{OL}\\beta) \\approx \\frac{\\mathrm{GBW}}{NG},\\qquad NG = \\frac{1}{\\beta}$$
<p>The noise gain is the gain from a source in series with the + input to the output, and it is what sets the loop. For a non-inverting stage it equals the signal gain; for an inverting stage it is one more than the gain magnitude:</p>
$$NG_{non\\text{-}inv} = 1 + \\frac{R_f}{R_{in}} = |G|,\\qquad NG_{inv} = 1 + \\frac{R_f}{R_{in}} = |G| + 1$$
<p>So an inverting buffer ($G = -1$) has only half the bandwidth of a follower. The 10–90 % rise time of a single-pole response is $t_r = \\ln 9/(2\\pi f_{-3dB}) \\approx 0.35/f_{-3dB}$.</p>`,
    },
    {
      title: 'Phase margin, peaking and overshoot',
      html: `<p>Real op-amps have more poles near GBW. When you enter the data-sheet phase margin $\\varphi_m$ at unity gain, the page adds a second pole $f_2$ that reproduces it, so the open loop is $A_{OL}/[(1+jf/f_1)(1+jf/f_2)]$. The closed loop is then a second-order low-pass:</p>
$$\\omega_0^2 = \\omega_1\\omega_2\\,(1 + A_{OL}\\beta),\\qquad Q = \\frac{1 + A_{OL}\\beta}{\\omega_0\\,(1/\\omega_1 + 1/\\omega_2)}$$
<p>Its −3 dB frequency is found exactly from $|H|^2 = 1/2$. The phase margin at the actual noise gain follows from the crossover $|A\\beta| = 1$. With $\\zeta = 1/(2Q)$, peaking appears for $Q > 0.707$ ($M_p = Q/\\sqrt{1 - 1/(4Q^2)}$) and step overshoot for $Q > 0.5$ ($e^{-\\pi\\zeta/\\sqrt{1-\\zeta^2}}$). As a rule of thumb, 45° of phase margin gives about 23 % overshoot, 60° about 9 %. Higher noise gain always increases the margin, which is why decompensated op-amps are only stable above a minimum gain.</p>`,
    },
    {
      title: 'Full-power bandwidth and slewing',
      html: `<p>The output cannot change faster than the slew rate SR. A sine $V_{pk}\\sin(2\\pi f t)$ has a maximum slope $2\\pi f V_{pk}$, so it stays undistorted only up to</p>
$$f_{FP} = \\frac{SR}{2\\pi V_{pk}}$$
<p>The usable bandwidth at a given swing is the lower of $f_{-3dB}$ and $f_{FP}$. A step slews instead of rising exponentially once its size exceeds SR divided by the steepest slope of the small-signal step response ($SR\\cdot\\tau$ for a single pole); the output then slews at SR until the remaining error equals $SR\\cdot\\tau$ and settles exponentially from there, so a large step takes longer than both $0.8\\,\\Delta V/SR$ and the small-signal $t_r$.</p>`,
    },
    {
      title: 'Cascaded stages',
      html: `<p>Splitting a high gain over several stages keeps each stage’s bandwidth high, but the responses multiply. For $n$ identical single-pole stages the −3 dB frequency is where $|H|^{2n} = 1/2$:</p>
$$f_{-3dB,n} = f_{-3dB,1}\\,\\sqrt{2^{1/n} - 1}$$
<p>(0.64 for two stages, 0.51 for three). The page solves the same condition exactly for second-order stages, and computes the cascade’s step response by numerical integration to get its rise time. Compare with the one-stage figure listed under “Chain”: three ×10 stages are usually much faster than one ×1000 stage.</p>`,
    },
    {
      title: 'Solving',
      html: `<ul>
<li><strong>GBW</strong> for a target bandwidth: Brent’s method on the forward model (with the phase margin, the second pole scales with GBW).</li>
<li><strong>Gain per stage</strong> for a target bandwidth: the bandwidth falls monotonically with gain, so the largest gain that still meets the target is unique.</li>
<li><strong>Slew rate</strong> for full power at the target: $SR = 2\\pi f V_{pk}$ exactly.</li>
</ul>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Allow margin.</strong> Data-sheet GBW and SR are typical values at one supply and load; minimums can be 30–50 % lower, and both drop at low supply or with capacitive load.</li>
<li><strong>Gain flatness.</strong> At $f_{-3dB}$ the gain is already 30 % down; for 1 % flatness a single-pole stage needs $f \\le 0.14 f_{-3dB}$.</li>
<li><strong>Feedback capacitance.</strong> A capacitor across $R_f$ adds a pole that limits the bandwidth further but restores phase margin; stray capacitance at the − input does the opposite.</li>
<li><strong>Current-feedback amplifiers</strong> do not follow GBW/NG; their bandwidth is set mainly by $R_f$.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. Franco, <em>Design with Operational Amplifiers and Analog Integrated Circuits</em>, 4th ed., McGraw-Hill, 2015, ch. 6 (dynamic limitations, slew rate, full-power bandwidth) and ch. 8 (stability, phase margin).</li>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015, §11.10 (two-pole feedback amplifiers) and ch. 10 (frequency response).</li>
<li>Op-amp data sheets: TI LM358 (SLOS068), TL072H (SLOS080W), NE5532 (SLOS075K), OPA2134 (SBOS058), TLV9002 (SBOS833R), OPA350 (SBOS099D); Microchip MCP6002 (DS20001733L).</li>
</ul>`,
    },
  ],
};
