import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Brushed DC motors — how this calculator works',
    lead:
      'In steady state a permanent-magnet brushed DC motor is described by two linear equations: the terminal voltage is the resistive drop plus the back-EMF, and the shaft torque is proportional to current. From a datasheet’s terminal resistance, torque (or speed) constant and no-load current, this page gives the speed, current, power and efficiency at any load, the whole speed–torque characteristic, and the voltage or torque needed for a target speed.',
  },
  sections: [
    {
      title: 'The two motor equations',
      html: `<p>With terminal voltage $V$, current $I$, terminal resistance $R$, shaft speed $\\omega$ (rad/s) and motor constant $K$:</p>
$$V = IR + K\\omega,\\qquad T = K\\,(I - I_0)$$
<p>In SI units the torque constant $K_t$ (N·m/A) and the back-EMF constant $K_e$ (V·s/rad) are the same number, because the electrical power converted, $K\\omega I$, must equal the mechanical power $T\\omega$. Datasheets quote the same constant several ways:</p>
$$K_v = \\frac{1}{K}\\ \\text{rad/s/V} = \\frac{60}{2\\pi K}\\ \\text{rpm/V},\\qquad K_e[\\text{V/krpm}] = 1000\\cdot\\frac{2\\pi}{60}K$$
<p>so 30.2 mN·m/A is 3.16 V/krpm and 316 rpm/V. The no-load current $I_0$ represents bearing and brush friction plus iron losses as a constant torque $K I_0$ that the motor must supply before any load. Being friction, it always opposes the motion and can never drive the shaft: below $V = I_0R$ (with no overhauling load) the motor stays still and simply draws $V/R$, and a load that overpowers the motor turns it backwards with the friction term reversed.</p>`,
    },
    {
      title: 'Speed–torque characteristic',
      html: `<p>Eliminating $I$ gives a straight line:</p>
$$\\omega(T) = \\frac{V - R I_0}{K} - \\frac{R}{K^2}\\,T = \\omega_0 - \\frac{R}{K^2}T$$
<p>The no-load speed is $\\omega_0 = (V - RI_0)/K$; the stall (start-up) current is $I_A = V/R$ and the stall torque $T_H = K(I_A - I_0)$. The slope $R/K^2$ — the speed–torque gradient on maxon datasheets — depends only on the motor, not on the voltage, so changing $V$ shifts the line parallel to itself. That is why voltage (or PWM duty) control gives a family of parallel lines.</p>
<p>Output power $P = T\\omega$ is a parabola with its maximum at half the stall torque and half the no-load speed: $P_{max} = \\omega_0 T_H/4$. At that point the motor is only about 50 % efficient, and the current is roughly half the stall current — usually far beyond its continuous rating.</p>`,
    },
    {
      title: 'Efficiency',
      html: `<p>$$\\eta = \\frac{T\\omega}{VI} = \\frac{(I - I_0)(V - IR)}{VI}$$</p>
<p>It is zero at no load (all input goes to friction) and at stall (all to $I^2R$). Setting $d\\eta/dI = 0$ gives the maximum at $I = \\sqrt{I_0 I_A}$ with</p>
$$\\eta_{max} = \\left(1 - \\sqrt{I_0/I_A}\\right)^2$$
<p>(maxon’s formula). Good motors reach their peak efficiency at a few percent to about 15 % of stall torque, near the top of the speed range; run them there in continuous duty.</p>`,
    },
    {
      title: 'Solving for voltage or torque',
      html: `<p>The model is linear in $V$, $T$ and $\\omega$, so each unknown has an exact inverse, used directly:</p>
$$V = K\\omega + R\\left(I_0 + \\frac{T}{K}\\right),\\qquad T = K\\left(\\frac{V - K\\omega}{R} - I_0\\right)$$
<p>Click ◎ on $V$, $T_L$ or $n$. Speed is the usual unknown; “supply voltage” answers “what voltage (or PWM duty × supply) holds 3000 rpm under this load?”; “load torque” gives how much torque is available at a required speed.</p>`,
    },
    {
      title: 'Temperature and practical notes',
      html: `<ul>
<li><strong>Winding temperature.</strong> Copper resistance rises 0.393 %/K of its 20 °C value ($R(\\vartheta) = R_{25}\\,[1 + \\alpha_{20}(\\vartheta - 20)]/[1 + 5\\alpha_{20}]$), so a winding at 100 °C has about 29 % more resistance than at 25 °C: the speed drops faster with load, and the stall torque and current fall. Datasheet resistances are at 25 °C; enter the expected winding temperature to see the effect.</li>
<li><strong>Magnets weaken with heat</strong> (roughly −0.1 %/K for NdFeB, −0.2 %/K for ferrite), raising the speed and current at a given torque. Not modelled.</li>
<li><strong>Thermal limit.</strong> The continuous current (and so torque) is limited by winding temperature, not by this characteristic. Brief overloads are fine within the datasheet’s duty-cycle curves.</li>
<li><strong>Start-up surge.</strong> At switch-on the motor is stalled and draws $V/R$ — size the supply, driver and fuse for it, or limit the current.</li>
<li><strong>PWM.</strong> With continuous current the motor responds to the average voltage. At low duty and low inductance the current can become discontinuous, and the motor then runs faster than this model predicts.</li>
<li><strong>Brushes</strong> add a roughly constant voltage drop (≈ 0.5–2 V for carbon) that is partly included in the terminal resistance on datasheets.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>maxon motor ag, “Key information — maxon DC motor and maxon EC motor” (motor data, operating ranges and formulae), in the maxon product catalogue.</li>
<li>maxon motor ag, RE 40 Ø40 mm, graphite brushes, 150 W — catalogue data sheet (article 148867, 24 V winding), used for the default motor and the worked example.</li>
<li>A. Hughes, B. Drury, <em>Electric Motors and Drives: Fundamentals, Types and Applications</em>, 4th ed., Newnes, 2013, ch. 3 (conventional d.c. motors, steady-state characteristics).</li>
<li>IEC 60028, <em>International standard of resistance for copper</em> (temperature coefficient 0.00393 /K at 20 °C).</li>
</ul>`,
    },
  ],
};
