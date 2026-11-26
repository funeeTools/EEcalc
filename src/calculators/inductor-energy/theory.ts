import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Inductor energy — how this calculator works',
    lead:
      'An inductor stores energy in its magnetic field while current flows through it. This page gives the stored energy and flux linkage, how long a voltage step takes to ramp the current up to a given value through the loop resistance, what happens to the energy when the current is switched off into a clamp, and checks the peak current against the part’s saturation current. It solves for the inductance, current or voltage needed for an energy or timing target.',
  },
  sections: [
    {
      title: 'Stored energy and flux linkage',
      html: `<p>The defining relation is $v = L\\,di/dt$. The power flowing into the inductor is $v\\,i = L\\,i\\,di/dt$, so building the current from zero to $I$ stores</p>
$$E = \\int_0^I L\\,i\\,di = \\tfrac12 L I^2 = \\frac{\\lambda^2}{2L},\\qquad \\lambda = L\\,I$$
<p>$\\lambda$ is the flux linkage (webers, or volt-seconds): the voltage–time area that must be applied to build up the current, whatever the shape of the voltage. Energy grows with the square of the current, so the part’s current rating, not its inductance, usually limits what it can hold.</p>`,
    },
    {
      title: 'Ramping the current: the RL step',
      html: `<p>A voltage step $V$ applied through a total loop resistance $R$ (winding DCR, switch, sense resistor, source) gives the first-order equation $L\\,di/dt + R\\,i = V$. From zero current,</p>
$$i(t) = \\frac{V}{R}\\left(1 - e^{-t/\\tau}\\right),\\qquad \\tau = \\frac{L}{R},\\qquad t_I = -\\tau\\,\\ln\\!\\left(1 - \\frac{I R}{V}\\right)$$
<p>The current can only approach $V/R$, so a target at or above it is never reached. When $R$ is small the start of the curve is a straight line, $i \\approx V t/L$ and $t_I \\approx L I/V$ — the ramp every switching converter relies on. The page shows both, and the initial slope $V/L$.</p>`,
    },
    {
      title: 'Switching off: where the energy goes',
      html: `<p>An inductor’s current cannot stop instantly. If the switch opens with nothing to carry it, the voltage rises until something breaks down. A clamp (a diode across the coil, or a zener or TVS) holds the reverse voltage at $V_{cl}$, and then $L\\,di/dt = -(V_{cl} + iR)$:</p>
$$i(t) = \\left(I + \\frac{V_{cl}}{R}\\right)e^{-t/\\tau} - \\frac{V_{cl}}{R},\\qquad t_{off} = \\tau\\ln\\!\\left(1 + \\frac{I R}{V_{cl}}\\right)$$
<p>The clamp absorbs $E_{cl} = V_{cl}\\int i\\,dt = L I^2\\,\\dfrac{x - \\ln(1+x)}{x^2}$ with $x = IR/V_{cl}$, and the resistance takes the rest of $\\tfrac12 L I^2$. A plain diode ($V_{cl} \\approx 0.7$ V) dumps most of the energy into the coil’s own resistance and releases a relay slowly; a higher clamp voltage ends the current sooner and puts more of the energy into the clamp, at the cost of a higher switch voltage ($V + V_{cl}$ for a clamp across the coil).</p>
<p>Where the clamp sits matters. With a diode (or diode + zener) across the coil, the supply is out of the decay loop and the clamp sees $V_{cl}$. With a zener or TVS of voltage $V_Z$ across a low-side switch, the supply stays in the loop: the coil sees only $V_Z - V$, so it decays with $V_{cl} = V_Z - V$, and the zener absorbs $V_Z\\int i\\,dt$ — the coil’s share times $V_Z/(V_Z - V)$, the rest coming from the supply. The switch then sees $V_Z$. The decay loop’s resistance can differ from the ramp’s: a clamp across the coil carries the current through the winding only, so enter that as $R_{off}$.</p>`,
    },
    {
      title: 'Saturation',
      html: `<p>Iron and ferrite cores carry only so much flux. Datasheets give a saturation current $I_{sat}$ at which the inductance has fallen by a stated fraction (commonly 10, 20 or 30 %). Past it, $L$ collapses and $di/dt = V/L$ rises sharply, so the current runs away within a switching cycle. Ferrite saturates abruptly; powdered-iron and alloy-powder cores roll off gradually. Keep the peak current, including ripple and transients, below $I_{sat}$ at the hottest operating temperature. $\\tfrac12 L I_{sat}^2$ is the most energy the part can usefully store.</p>`,
    },
    {
      title: 'Solving for L, I or V',
      html: `<ul>
<li><strong>E and t</strong> (default) — computed from L, I, V and R.</li>
<li><strong>L</strong> — for an energy target $L = 2E/I^2$; for a ramp-time target $L = t R / [-\\ln(1 - IR/V)]$ (or $V t/I$ for $R = 0$). With E-series selected, the nearest preferred inductances are listed with the energy and time each gives.</li>
<li><strong>I</strong> — $I = \\sqrt{2E/L}$, or the current reached at time $t$: $I = (V/R)(1 - e^{-tR/L})$.</li>
<li><strong>V</strong> — the step needed to reach $I$ in time $t$: $V = IR / (1 - e^{-tR/L})$.</li>
</ul>
<p>All are exact rearrangements of the same equations, so a solved value typed back in gives the target again. Click ◎ on the green E or t to make it the target.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Two current ratings.</strong> $I_{sat}$ is magnetic; the rated (heating) current $I_{rms}$ is thermal and can be higher or lower. Check both.</li>
<li><strong>Inductance changes with current and temperature.</strong> Use the datasheet’s L-versus-I curve at the operating point, not the zero-current value.</li>
<li><strong>Relay and solenoid coils</strong> change inductance as the armature moves, so their current rise is not a clean exponential; treat the result as an estimate. A slow-release diode clamp can delay contact opening by milliseconds; a zener clamp speeds it up.</li>
<li><strong>Always give the energy a path.</strong> Unclamped switch-off of even a few microjoules can avalanche a MOSFET; check its single-pulse avalanche energy rating if you rely on that.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, §6.4 (inductors: $v = L\\,di/dt$, $w = \\tfrac12 L i^2$; Practice Problem 6.8) and §7.6 (step response of an RL circuit).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.5 (inductors) and §1.6 (diode circuits: inductive loads and their protection).</li>
<li>J. W. Nilsson, S. A. Riedel, <em>Electric Circuits</em>, 10th ed., Pearson, 2015, ch. 7 (response of first-order RL circuits).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em> (E-series, also used for inductors).</li>
</ul>`,
    },
  ],
};
