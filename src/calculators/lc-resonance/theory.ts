import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'LC resonance — how this calculator works',
    lead:
      'An inductor and a capacitor exchange energy back and forth at one frequency, where their reactances are equal and opposite. This page finds that frequency (or the L or C that puts it where you want), the characteristic impedance $\\sqrt{L/C}$, and — once you add the losses — the Q factor, the −3 dB bandwidth and the impedance curve of a series circuit or a parallel tank. Bandwidth and Q are taken from the exact impedance, so they remain right when Q is low.',
  },
  sections: [
    {
      title: 'Resonant frequency and characteristic impedance',
      html: `<p>The reactances $X_L = \\omega L$ and $X_C = 1/\\omega C$ are equal at</p>
$$f_0 = \\frac{1}{2\\pi\\sqrt{LC}},\\qquad \\omega_0 = 2\\pi f_0$$
<p>where both equal the characteristic impedance</p>
$$Z_0 = \\sqrt{L/C} = \\omega_0 L = \\frac{1}{\\omega_0 C}.$$
<p>$Z_0$ is the natural impedance level of the resonator: it sets how large a resistance counts as “small” (series) or “large” (parallel), and so it fixes Q for given losses. The same $f_0$ can be reached with a large L and small C (high $Z_0$) or the reverse; that choice is a design decision about Q and about how big the parasitics are relative to the parts.</p>`,
    },
    {
      title: 'Series RLC',
      html: `<p>With all the loop resistance lumped into $R$, $Z(\\omega) = R + j(\\omega L - 1/\\omega C)$. At $f_0$ the reactances cancel and $|Z|$ is at its minimum, $R$. The quality factor and the exact half-power (−3 dB) frequencies are</p>
$$Q = \\frac{\\omega_0 L}{R} = \\frac{Z_0}{R},\\qquad \\omega_{1,2} = \\mp\\frac{R}{2L} + \\sqrt{\\left(\\frac{R}{2L}\\right)^2 + \\omega_0^2}$$
<p>so the bandwidth is exactly $\\omega_2 - \\omega_1 = R/L$, or $BW = f_0/Q$, and $f_0 = \\sqrt{f_1 f_2}$ (geometric mean). At resonance the voltage across L and across C is $Q$ times the drive voltage — a series circuit with $Q = 50$ fed from 10 V puts 500 V across the capacitor. With $Q < \\tfrac12$ ($R > 2Z_0$) the circuit is overdamped: its step response no longer rings. The frequency response still peaks at $f_0$ with $BW = R/2\\pi L$ — it is just very broad. A tank whose coil loss is very high is different: its $|Z|$ can lose the maximum altogether, and then the page reports no Q or bandwidth.</p>`,
    },
    {
      title: 'Parallel tank',
      html: `<p>A practical tank is a coil with series loss $r_L$ in parallel with the capacitor, and possibly a shunt resistance $R_p$ (load, drive source or core loss). Its admittance is</p>
$$Y(\\omega) = \\frac{1}{R_p} + j\\omega C + \\frac{1}{r_L + j\\omega L}.$$
<p>The impedance is purely resistive (zero phase) at</p>
$$f_r = f_0\\sqrt{1 - \\frac{r_L^2 C}{L}},$$
<p>slightly below $f_0$, and there it equals the <em>dynamic resistance</em> $R_D = R_p \\,\\|\\, \\dfrac{L}{r_L C}$. If $r_L \\ge \\sqrt{L/C}$ there is no zero-phase frequency at all. The peak of $|Z|$ lies at yet another, nearby frequency; for $Q \\gtrsim 10$ the three coincide within a fraction of a percent.</p>
<p>Each loss sets its own Q: the coil $Q_L = \\omega_0 L / r_L$, the shunt $Q_p = R_p/(\\omega_0 L)$, and together $1/Q \\approx 1/Q_L + 1/Q_p$. With only $R_p$ (ideal coil) the bandwidth is exactly $1/(2\\pi R_p C)$. The current that circulates inside the tank is about $Q$ times the current fed into it.</p>`,
    },
    {
      title: 'How Q and bandwidth are computed',
      html: `<p>The page evaluates the exact complex impedance. It finds the response peak (minimum $|Z|$ for the series circuit, maximum for the tank) with a golden-section search, then the two frequencies where the response is 3.01 dB down by bisection. The bandwidth is $f_2 - f_1$ and the reported Q is $f_{peak}/BW$. For a series RLC this is identical to $Z_0/R$; for a tank with coil loss it differs slightly from the energy-based formula at low Q, which is also listed. When the response never drops 3 dB on one side (very low Q) no bandwidth is given.</p>`,
    },
    {
      title: 'Solving for f₀, L or C',
      html: `<p>Click ◎ beside $f_0$, $L$ or $C$ to make it the unknown. The relation $f_0 = 1/2\\pi\\sqrt{LC}$ is inverted exactly: $L = 1/(\\omega_0^2 C)$ or $C = 1/(\\omega_0^2 L)$. The target is always the undamped $f_0$; for a lossy tank the zero-phase frequency $f_r$ is shown separately. The nearest preferred values (E12 by default) for both parts are listed with the $f_0$ each one gives, which is what you will actually build — then trim with a variable capacitor or a slug-tuned coil if the tolerance matters.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Strays add to C.</strong> Pads, traces and the input capacitance of whatever is connected add a few pF; at 10 MHz with 22 pF that is a 5–10 % shift in $f_0$.</li>
<li><strong>Self-resonance.</strong> Every inductor has a self-resonant frequency (SRF) from its winding capacitance; keep $f_0$ well below it (a factor of 5–10). Capacitors have a series SRF from their ESL.</li>
<li><strong>Coil Q varies with frequency.</strong> Datasheet Q is specified at one test frequency; skin and proximity effect raise $r_L$ with frequency. Enter $r_L = \\omega_0 L / Q_L$ at your $f_0$.</li>
<li><strong>Tolerance.</strong> $f_0 \\propto (LC)^{-1/2}$, so ±5 % on each part gives up to about ±5 % on $f_0$ — wide compared with the bandwidth of a high-Q circuit. Use C0G/NP0 capacitors for stability.</li>
<li><strong>Loading lowers Q.</strong> A source or load connected directly across a tank appears as $R_p$. Tap the coil or use a capacitive divider to transform it to a higher value.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §6.1 (series and parallel resonant circuits, Q, bandwidth).</li>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, ch. 14 (series and parallel resonance, half-power frequencies; series example R = 2 Ω, L = 1 mH, C = 0.4 µF).</li>
<li>R. L. Boylestad, <em>Introductory Circuit Analysis</em>, 13th ed., Pearson, 2016, chapter “Resonance” (parallel resonant circuit with a practical coil).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
