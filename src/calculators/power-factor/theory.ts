import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Power factor and capacitor correction — how this calculator works',
    lead:
      'Power factor is the fraction of the apparent power V·I that does useful work. This page splits it, as IEEE Std 1459 does, into a displacement part (the phase angle of the fundamental current) and a distortion part (the harmonic currents), and sizes the shunt capacitor that moves the displacement PF to a target — or, given a capacitor, finds the PF and line current it leaves. It covers single-phase loads and balanced three-phase loads with a Δ or Y bank.',
  },
  sections: [
    {
      title: 'Powers and power factor (IEEE 1459)',
      html: `<p>With a sinusoidal supply voltage $V$ and a load current whose fundamental $I_1$ lags the voltage by $\\theta_1$, the standard defines</p>
$$P = V I_1\\cos\\theta_1,\\qquad Q_1 = V I_1 \\sin\\theta_1,\\qquad S_1 = V I_1 = \\sqrt{P^2 + Q_1^2}$$
<p>Harmonic currents $I_H$ carry no active power from a sinusoidal voltage but still load the wiring. They add the current distortion power $D_I = V I_H = S_1\\,\\mathrm{THD}_I$, and the total apparent power is</p>
$$S = V I = \\sqrt{S_1^2 + D_I^2},\\qquad I = I_1\\sqrt{1 + \\mathrm{THD}_I^2}$$
<p>so the true power factor is the product of a displacement and a distortion factor:</p>
$$\\mathrm{PF} = \\frac{P}{S} = \\cos\\theta_1 \\cdot \\frac{1}{\\sqrt{1 + \\mathrm{THD}_I^2}}$$
<p>For three-phase balanced systems every $V I$ becomes $\\sqrt{3}\\,V_L I_L$ with the line-to-line voltage and the line current. $Q_1 > 0$ means a lagging (inductive) load. The page takes the load as $P$, $S$ or $I$ — the other two are computed and shown in green; click ◎ on one to enter the load that way instead.</p>`,
    },
    {
      title: 'Shunt capacitor correction',
      html: `<p>A capacitor in parallel with the load supplies reactive power locally, so the line carries only the difference. To move the displacement angle from $\\theta_1$ to $\\theta_2$ at constant $P$:</p>
$$Q_C = P\\,(\\tan\\theta_1 - \\tan\\theta_2),\\qquad \\tan\\theta_2 < 0 \\text{ for a leading target}$$
<p>Each capacitor supplies $\\omega C V_C^2$, where $V_C$ is the voltage across it. With $\\omega = 2\\pi f$:</p>
$$C = \\frac{Q_C}{k\\,\\omega V^2},\\qquad k = \\begin{cases} 1 & \\text{single-phase} \\\\ 3 & \\text{three-phase, Δ bank (each C on } V_L) \\\\ 1 & \\text{three-phase, Y bank (each C on } V_L/\\sqrt3) \\end{cases}$$
<p>A Δ bank therefore needs one third of the capacitance of a Y bank, at $\\sqrt3$ times the voltage rating. The line current falls from $S_1/V$ to $\\sqrt{P^2 + (Q_1 - Q_C)^2}/V$ for the fundamental; harmonic currents are unchanged, so the THD of the line current rises after correction even though its rms value falls.</p>
<p><strong>Solve-for.</strong> ◎ C computes $Q_C$ and $C$ from the target in closed form; ◎ target PF analyses the load with the capacitor entered. The two are exact inverses. A load that already meets the target gets $C = 0$; a leading load needs a shunt reactor, not a capacitor.</p>`,
    },
    {
      title: 'Harmonics and resonance',
      html: `<p>A capacitor cannot correct distortion: with $\\mathrm{THD}_I$ = 100 % the true PF stays below $1/\\sqrt2 \\approx 0.71$ however much capacitance is added. Rectifier loads (SMPS, drives without chokes) need active PFC or line reactors and filters instead.</p>
<p>A shunt bank also forms a parallel resonance with the supply inductance. In per-unit terms the resonant harmonic is</p>
$$h_r = \\sqrt{\\frac{S_{sc}}{Q_C}}$$
<p>with $S_{sc}$ the short-circuit power at the bank (IEEE 1531). Near the 5th or 7th harmonic (or the 3rd on single-phase systems) the resonance amplifies harmonic currents from other loads and can fail the capacitors; detuned banks with a series reactor (typically 5.67–7 %, tuning below the 5th) avoid it. Enter $S_{sc}$ to get the check.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Utilities usually bill or penalise below 0.9–0.95 lagging. Correcting to exactly 1 needs much more capacitance for little gain, and a fixed bank sized for full load turns leading at light load — use automatic stepped banks for varying loads.</li>
<li>Rate capacitors for the voltage across them, not the system voltage: Δ units see $V_L$, Y units $V_L/\\sqrt3$. IEEE 18 lets power capacitors run continuously at 110 % of rated rms voltage and 135 % of rated reactive power.</li>
<li>Motor-terminal capacitors must not exceed the motor’s magnetising var, or the motor self-excites when disconnected.</li>
<li>The model assumes a stiff sinusoidal supply: the voltage does not change with the correction, and harmonic voltages are zero.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>IEEE Std 1459-2010, <em>IEEE Standard Definitions for the Measurement of Electric Power Quantities Under Sinusoidal, Nonsinusoidal, Balanced, or Unbalanced Conditions</em>.</li>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, McGraw-Hill: ch. 11, power factor correction (worked example: 4 kW at 0.8 lagging, 120 V 60 Hz → 0.95 needs 310.5 µF).</li>
<li>J. Arrillaga, N. R. Watson, <em>Power System Harmonics</em>, 2nd ed., Wiley, 2003: power factor with distorted currents; capacitor resonance.</li>
<li>IEEE Std 1531-2003, <em>Guide for Application and Specification of Harmonic Filters</em>; IEEE Std 18-2012, <em>Standard for Shunt Power Capacitors</em>; IEEE Std 1036-2010, <em>Guide for the Application of Shunt Power Capacitors</em>.</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics</em>, 3rd ed., Wiley, 2003, ch. 5 and 18: line-current harmonics, displacement and distortion power factor of rectifiers.</li>
</ul>`,
    },
  ],
};
