import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'PWM speed control of a brushed DC motor — how this calculator works',
    lead:
      'A PWM drive switches the full supply on and off thousands of times a second; the motor’s inductance smooths the current, and its inertia smooths the speed. This page solves the armature current exactly in each switch state, finds the periodic steady state (continuous or discontinuous), and balances the mean torque against the load to give the speed, the duty for a target speed, or the torque at a speed. The result includes ripple, RMS current, losses and the supply-side currents.',
  },
  sections: [
    {
      title: 'Armature circuit in one PWM period',
      html: `<p>Over one period $T = 1/f_{PWM}$ the speed is practically constant, so the back-EMF $E = K\\omega$ is too. In each switch state the bridge applies a fixed voltage $v$ through a loop resistance $R_x$ (motor plus the switches in the path), and</p>
$$L\\frac{di}{dt} = v - R_x\\,i - E \\quad\\Rightarrow\\quad i(t) = I_\\infty + \\big(i(0)-I_\\infty\\big)e^{-t/\\tau},\\qquad I_\\infty = \\frac{v-E}{R_x},\\ \\tau = \\frac{L}{R_x}$$
<p>The three drives differ only in the off-state:</p>
<ul>
<li><strong>Low-side switch + freewheel diode:</strong> on: $v = V_s$, $R_x = R + R_{on}$; off: $v = -V_F$, $R_x = R$. The diode cannot carry negative current, so at light load the current can fall to zero before the period ends (discontinuous conduction). The motor terminal then shows its own back-EMF.</li>
<li><strong>H-bridge, sign-magnitude with synchronous rectification:</strong> on: $v = V_s$; off: $v = 0$ through two low-side switches. The current may reverse, so conduction is always continuous. $R_x = R + 2R_{on}$.</li>
<li><strong>H-bridge, locked anti-phase:</strong> on: $v = +V_s$; off: $v = -V_s$. The mean voltage is $(2D-1)V_s$, so 50 % is standstill, and the ripple is about twice as large.</li>
</ul>`,
    },
    {
      title: 'Periodic steady state, ripple and RMS',
      html: `<p>With $a_1 = e^{-DT/\\tau_1}$ and $a_2 = e^{-(1-D)T/\\tau_2}$, requiring $i(T) = i(0)$ gives the current at the start of the on-interval</p>
$$I_0 = \\frac{I_{\\infty 2}(1-a_2) + a_2\\,I_{\\infty 1}(1-a_1)}{1 - a_1a_2}$$
<p>If the low-side drive gives $I_0 < 0$, the conduction is discontinuous: the current starts from zero, rises to $I_1 = I_{\\infty1}(1-a_1)$ and decays to zero after $t_x = \\tau_2\\ln\\big((I_1 - I_{\\infty2})/(-I_{\\infty2})\\big)$. Mean and RMS values are exact integrals of the exponentials. When $\\tau \\gg T$ the waveform becomes triangular and the familiar small-ripple results follow:</p>
$$\\Delta I_{pp} \\approx \\frac{V_s D(1-D)}{L f_{PWM}}\\ \\text{(low-side, sign-magnitude)},\\qquad \\Delta I_{pp} \\approx \\frac{2V_s D(1-D)}{L f_{PWM}}\\ \\text{(anti-phase)},\\qquad I_{rms}^2 = \\bar I^2 + \\frac{\\Delta I_{pp}^2}{12}$$
<p>Ripple produces no mean torque but raises copper loss by $(I_{rms}/\\bar I)^2 - 1$, causes brush wear and heats the magnets. The page warns above 10 % extra copper loss; motor makers suggest a series choke for low-inductance motors on PWM.</p>`,
    },
    {
      title: 'Torque balance and solving',
      html: `<p>The mean electromagnetic torque is $K\\bar I$. With the no-load current $I_0$ standing for friction and iron losses (the model of the DC Motor calculator), the steady state needs</p>
$$K\\,\\big(\\bar I(\\omega) - I_0\\big) = T_L$$
<p>$\\bar I$ falls monotonically as $\\omega$ (and so $E$) rises, so the speed is the single root on $0 \\le \\omega \\le V_s/K$ (Brent’s method). The duty for a target speed is the root of $\\bar I(\\omega, D) = T_L/K + I_0$ in $D$ at fixed $\\omega$, and the torque at a given speed and duty is direct. In continuous conduction with equal loop resistance in both states the mean equation is exactly the DC motor on the mean voltage $DV_s$ (or $(2D-1)V_s$). The page shows this averaged model for comparison; it differs for the low-side drive (diode drop, discontinuous conduction).</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Frequency.</strong> Above 20 kHz the drive is inaudible. The ripple falls as $1/f$, but switching losses rise with $f$.</li>
<li><strong>Low-inductance motors.</strong> Coreless (ironless) motors have tens of µH. Without a choke their RMS current, and so their heating, can be much higher than the mean current suggests.</li>
<li><strong>Bus capacitor.</strong> The supply current is pulsed: it is the armature current during the on-time and zero (or negative, for anti-phase) otherwise. The capacitor carries the AC part, $\\sqrt{I_{s,rms}^2 - \\bar I_s^2}$.</li>
<li><strong>Light load on a low-side drive.</strong> In discontinuous conduction the speed depends on the load much more than the averaged model predicts. Speed loops need the gain margin for it, or use a synchronous bridge.</li>
<li><strong>Not modelled:</strong> switching transitions, dead time, brush drop, armature reaction, speed ripple within a period, and magnet temperature.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, ch. 7 (dc–dc converters: the step-down converter, whose ripple the low-side and sign-magnitude drives follow, and the full bridge with bipolar switching, which is locked anti-phase; Mohan’s unipolar scheme ripples at twice the switching frequency and is a different drive) and ch. 13 (dc motor drives).</li>
<li>A. Hughes, B. Drury, <em>Electric Motors and Drives</em>, 4th ed., Newnes, 2013, ch. 3 (d.c. motors) and ch. 4 (d.c. motor drives).</li>
<li>maxon motor, <em>Key information — maxon DC motor</em> (motor data and formulae); <em>Current ripple due to PWM resulting in motor heating</em>, support note, 2018.</li>
<li>maxon motor, product data RE 40 Ø40 mm, 150 W, order no. 148867 (R = 0.299 Ω, L = 0.0824 mH, K_t = 30.2 mN·m/A, I₀ = 137 mA).</li>
<li>Linköping University, TSTE25 Power Electronics, exam 2023-10-20, problem 2 (armature ripple worked example used in the tests).</li>
</ul>`,
    },
  ],
};
