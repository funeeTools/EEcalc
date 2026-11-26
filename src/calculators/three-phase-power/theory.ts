import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Three-phase power — how this calculator works',
    lead:
      'A balanced three-phase load is three identical single-phase loads whose voltages are 120° apart. This page relates the quantities you can measure on the lines — line voltage, line current and power factor — to the real, reactive and apparent power and to the voltage, current and impedance of each phase, for star (Y) and delta (Δ) connections. It can also solve for the current, voltage or power factor from a power, and find the neutral current of an unbalanced four-wire star load.',
  },
  sections: [
    {
      title: 'Line and phase quantities',
      html: `<p>The line voltage $V_L$ is measured between two lines, the line current $I_L$ in one line. What each phase of the load sees depends on the connection:</p>
$$\\text{Y:}\\quad V_{ph} = \\frac{V_L}{\\sqrt3},\\; I_{ph} = I_L \\qquad\\qquad \\text{Δ:}\\quad V_{ph} = V_L,\\; I_{ph} = \\frac{I_L}{\\sqrt3}$$
<p>With phase sequence ABC, the line voltage $V_{ab}$ leads the phase voltage $V_{an}$ by 30°; in a Δ load the line current $I_a = I_{ab} - I_{ca}$ lags the phase current $I_{ab}$ by 30°. The phasor drawing shows both.</p>`,
    },
    {
      title: 'Power',
      html: `<p>Each phase contributes $V_{ph}I_{ph}\\cos\\theta$, where $\\theta$ is the angle between its voltage and current. Summing three phases and substituting either connection gives the same line-quantity formulas:</p>
$$S = 3V_{ph}I_{ph} = \\sqrt3\\,V_L I_L,\\qquad P = S\\cos\\theta,\\qquad Q = S\\sin\\theta$$
<p>$\\theta > 0$ (lagging, inductive) gives $Q > 0$. The per-phase load impedance is $Z_{ph} = V_{ph}/I_{ph}\\angle\\theta$, so $R_{ph} = |Z|\\cos\\theta$ and $X_{ph} = |Z|\\sin\\theta$; a Δ load is equivalent to a Y load with $Z_Y = Z_Δ/3$.</p>
<p>The instantaneous power of one phase, $p_a(t) = V_{ph}I_{ph}[\\cos\\theta + \\cos(2\\omega t - \\theta)]$, pulsates at twice the line frequency, but the three pulsations are 120° apart and cancel: the total $p_a + p_b + p_c = P$ is constant. That is why three-phase motors run with constant torque — see the second graph.</p>`,
    },
    {
      title: 'Solve-for on this page',
      html: `<p>Every relation above is linear in $V_L$, $I_L$ and $\\cos\\theta$, so the unknowns are solved exactly:</p>
$$I_L = \\frac{P}{\\sqrt3\\,V_L\\cos\\theta} = \\frac{S}{\\sqrt3\\,V_L},\\qquad V_L = \\frac{P}{\\sqrt3\\,I_L\\cos\\theta},\\qquad \\cos\\theta = \\frac{P}{\\sqrt3\\,V_L I_L}$$
<p>Solving for the current from a kVA rating (choose “apparent power S”) needs no power factor. A power factor from meter readings must come out ≤ 1; if $P > \\sqrt3 V_L I_L$ the readings are inconsistent. The lagging/leading choice cannot be deduced from $P$, $V$ and $I$ — it only sets the sign of $Q$.</p>`,
    },
    {
      title: 'Unbalanced four-wire star: neutral current',
      html: `<p>When the three phase currents differ, the neutral carries their phasor sum</p>
$$\\mathbf I_N = \\mathbf I_a + \\mathbf I_b + \\mathbf I_c = 3\\,\\mathbf I_0$$
<p>Fortescue’s symmetrical components split any set of three phasors into positive, negative and zero sequence, with $a = 1\\angle120°$:</p>
$$\\mathbf I_1 = \\tfrac13(\\mathbf I_a + a\\mathbf I_b + a^2\\mathbf I_c),\\quad \\mathbf I_2 = \\tfrac13(\\mathbf I_a + a^2\\mathbf I_b + a\\mathbf I_c),\\quad \\mathbf I_0 = \\tfrac13(\\mathbf I_a + \\mathbf I_b + \\mathbf I_c)$$
<p>$I_2/I_1$ is the current unbalance factor. Enter the currents with their angles measured from $V_{an}$ (e.g. a lagging load on phase B at $-120° - \\theta$). Only the fundamental is summed: triplen harmonic currents (3rd, 9th…) from rectifier loads are in phase in all three lines and add directly in the neutral, which can then carry more than any phase.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Nameplate voltages are line-to-line (400 V, 480 V, 11 kV); a 230/400 V system has 230 V line to neutral.</li>
<li>Motor nameplate power is shaft output: the electrical input is $P_{out}/\\eta$, which is what the line current formula needs.</li>
<li>Transformer full-load current is $S_{rated}/(\\sqrt3 V_L)$ regardless of the load power factor.</li>
<li>The formulas assume sinusoidal, balanced voltages and currents. With harmonics use true-rms meters, and use the power-factor page for displacement vs distortion power factor.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, McGraw-Hill: ch. 12, three-phase circuits (balanced Y–Δ example: $V_{an}$ = 100 V into Δ of 8 + j4 Ω gives $I_a$ = 33.54 A).</li>
<li>J. D. Glover, M. S. Sarma, T. J. Overbye, <em>Power System Analysis and Design</em>, 5th ed., Cengage, 2012: ch. 2 (balanced three-phase circuits, power), ch. 8 (symmetrical components).</li>
<li>C. L. Fortescue, “Method of symmetrical co-ordinates applied to the solution of polyphase networks,” <em>Trans. AIEE</em> 37, pp. 1027–1140, 1918.</li>
<li>IEEE Std 1459-2010, <em>Definitions for the Measurement of Electric Power Quantities Under Sinusoidal, Nonsinusoidal, Balanced, or Unbalanced Conditions</em>.</li>
</ul>`,
    },
  ],
};
