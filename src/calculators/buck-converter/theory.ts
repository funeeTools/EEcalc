import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Buck converter power stage — how this calculator works',
    lead:
      'A buck converter chops the input with a switch at a fixed frequency and averages the result with an LC filter, so the output is the input scaled by the duty cycle. This page sizes the power stage in steady state: duty cycle, inductor ripple and peak current, output and input ripple, capacitor RMS currents and a first-order loss budget. It follows the equations of TI’s application note SLVA477 and the averaged-model treatment in Erickson & Maksimović, and evaluates the ripple exactly on the piecewise-linear inductor current.',
  },
  sections: [
    {
      title: 'Duty cycle',
      html: `<p>In steady state the average voltage across the inductor is zero (volt-second balance). With ideal parts this gives $D = V_{out}/V_{in}$. Adding the conduction drops — high-side on-resistance $R_{HS}$, inductor winding resistance $R_L$ (DCR) and either the low-side on-resistance $R_{LS}$ or the diode forward voltage $V_F$ — the balance reads</p>
$$D\\,(V_{in} - I R_{HS}) - (1-D)\\,V_{off} = V_{out} + I R_L,\\qquad V_{off} = \\begin{cases} I R_{LS} & \\text{synchronous} \\\\ V_F & \\text{diode} \\end{cases}$$
$$\\Rightarrow\\quad D = \\frac{V_{out} + I R_L + V_{off}}{V_{in} - I R_{HS} + V_{off}}$$
<p>which is the steady-state model of Erickson & Maksimović, chapter 3. SLVA477 reaches the same place more crudely by dividing by an assumed efficiency, $D = V_{out}/(V_{in}\\,\\eta)$. The duty cycle must stay below the controller’s maximum (often 90–95 %), and the on-time $D/f_{sw}$ above its minimum on-time (typically 50–150 ns) — both are checked.</p>`,
    },
    {
      title: 'Inductor ripple and current',
      html: `<p>During the on-time the inductor sees $V_{in} - I R_{HS} - I R_L - V_{out}$, so its current rises by</p>
$$\\Delta I_L = \\frac{(V_{in} - I R_{HS} - I R_L - V_{out})\\,D}{f_{sw}\\,L} \\;\\approx\\; \\frac{(V_{in}-V_{out})\\,D}{f_{sw}\\,L}\\quad\\text{(SLVA477 eq. 2)}$$
<p>and the inductance for a chosen ripple is SLVA477 eq. 5, $L = V_{out}(V_{in}-V_{out})/(\\Delta I_L f_{sw} V_{in})$. A ripple ratio $\\Delta I_L/I_{out}$ of 20–40 % is the usual compromise between inductor size, transient speed and ripple. The inductor must carry</p>
$$I_{L,pk} = I_{out} + \\frac{\\Delta I_L}{2},\\qquad I_{L,rms} = \\sqrt{I_{out}^2 + \\frac{\\Delta I_L^2}{12}}$$
<p>Choose a saturation current above $I_{L,pk}$ at the highest input voltage and at the current-limit level, and a thermal (RMS) rating above $I_{L,rms}$.</p>`,
    },
    {
      title: 'Continuous and discontinuous conduction',
      html: `<p>The valley current $I_{out} - \\Delta I_L/2$ reaches zero at the boundary load $I_{crit} = \\Delta I_L/2$. Below it, what happens depends on the rectifier:</p>
<ul>
<li><strong>Diode (asynchronous):</strong> the diode blocks reverse current, so the inductor current stays at zero for part of each cycle (DCM). The conversion ratio then depends on load. The current ramps up for $D_1T$ with $v_{up} = V_{in}-V_{out}-\\tfrac{I_{pk}}{2}(R_{HS}+R_L)$ across the inductor and down for $D_2T$ with $v_{dn} = V_{out}+V_F+\\tfrac{I_{pk}}{2}R_L$, so
$$D_1 = \\frac{I_{pk}L f_{sw}}{v_{up}},\\quad D_2 = \\frac{I_{pk}L f_{sw}}{v_{dn}},\\quad I_{out} = \\tfrac12 I_{pk}(D_1+D_2)$$
(Erickson & Maksimović ch. 5, here with the drops kept). The resistive drops use the interval-average current $I_{pk}/2$, which equals $I_{out}$ at the boundary, so the DCM and CCM solutions meet continuously; the page uses DCM only when $D_1 + D_2 < 1$.</li>
<li><strong>Synchronous, forced PWM:</strong> the low-side FET conducts in both directions, so the converter stays in CCM and the inductor current goes negative at light load. The page computes this case. Controllers with diode emulation or pulse skipping behave like the diode case or skip cycles instead.</li>
</ul>`,
    },
    {
      title: 'Output and input ripple',
      html: `<p>The output capacitor absorbs the AC part of the inductor current, $i_C = i_L - I_{out}$. Its voltage is the charge term plus the ESR drop,</p>
$$v_{out}(t) = \\frac{1}{C}\\int i_C\\,dt + R_{ESR}\\,i_C(t)$$
<p>For a triangle with no ESR the peak-to-peak value is $\\Delta I_L/(8 f_{sw} C)$ (SLVA477 eq. 12); with a pure resistive capacitor it is $R_{ESR}\\,\\Delta I_L$ (eq. 13). Real capacitors sit in between, and simply adding the two overestimates the ripple because the peaks do not line up. This page evaluates $v_{out}(t)$ exactly on each linear piece of the waveform (the extremes are at the piece ends or where $dv/dt = 0$), in CCM and DCM alike. The two limiting forms are listed for comparison.</p>
<p>The input capacitor supplies the pulsed high-side current while the source supplies its average, so its RMS current is</p>
$$I_{C_{in},rms} = \\sqrt{I_{HS,rms}^2 - I_{HS,avg}^2} \\approx I_{out}\\sqrt{D(1-D)}$$
<p>which peaks at $I_{out}/2$ for $D = 0.5$. The input ripple uses the same exact evaluation on that current; in CCM its charge term reduces to $I_{out} D(1-D)/(f_{sw} C_{in})$. Ceramic capacitors lose much of their capacitance under DC bias; enter the effective value.</p>
<p>For a load step $\\Delta I$ the capacitor supplies (or absorbs) the difference while the inductor current catches up. On a load <em>release</em> the inductor current falls at $V_{out}/L$, and SLVA477 eq. 14 gives the capacitance for an overshoot $V_{os}$: $C_{out} \\ge \\Delta I^2 L/(2 V_{out} V_{os})$. On a load <em>increase</em> the same charge balance with the current rising at $(V_{in}-V_{out})/L$ (switch fully on) gives the undershoot bound $C_{out} \\ge \\Delta I^2 L/(2 (V_{in}-V_{out}) V_{us})$, which governs when $D > 0.5$. The page reports the larger of the two for a 5 % deviation and says which governs. Both ignore the control loop’s reaction time and the maximum-duty limit, which in practice make the deviation larger.</p>`,
    },
    {
      title: 'Losses and efficiency',
      html: `<p>The loss budget is a first-order estimate, good for comparing parts and spotting the dominant term:</p>
<ul>
<li>Conduction: $I_{HS,rms}^2 R_{HS}$, $I_{LS,rms}^2 R_{LS}$ (or $I_F V_F$ for a diode, $I_F = I_{out}(1-D)$, SLVA477 eq. 7–8), $I_{L,rms}^2 R_L$, and the capacitor ESR terms $I_{rms}^2 R_{ESR}$.</li>
<li>Switching: each hard-switched edge dissipates about $\\tfrac12 V_{in} I\\, t_{edge}$; with turn-on at the valley current, turn-off at the peak and equal rise and fall times this is $\\approx \\tfrac12 V_{in} I_{out}(t_r+t_f) f_{sw}$ (Erickson §4.3).</li>
<li>Gate drive: $Q_g V_{drv} f_{sw}$, dissipated in the driver and gate resistances (Balogh, TI SLUA618).</li>
</ul>
<p>Not modelled: inductor core loss, MOSFET output-capacitance ($\\tfrac12 C_{oss}V^2 f$) and reverse-recovery loss, dead-time body-diode conduction and the controller’s quiescent current. At light load these dominate, so the efficiency curve is optimistic there. The on-resistance rises roughly 1.5× from 25 °C to 125 °C; enter the hot value for a worst-case estimate.</p>`,
    },
    {
      title: 'Solving for L, fsw or Cout',
      html: `<p>Click ◎ beside $L$, $f_{sw}$ or $C_{out}$ to make it the unknown. For $L$ and $f_{sw}$ the target is the ripple ratio; for $C_{out}$ it is the peak-to-peak output ripple (click the green ripple box to type a target). The page keeps one forward model and finds the unknown with a bracketed Brent search, so a solved value typed back in reproduces the target exactly — including the conduction drops and, if the target pushes it there, discontinuous conduction. Solving for $C_{out}$ has no answer when the ESR alone already exceeds the target; the page says so.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Corners.</strong> Check ripple and peak current at the highest $V_{in}$ and the duty cycle at the lowest; run the page at both.</li>
<li><strong>Inductor.</strong> Rate $I_{sat}$ above the controller’s current limit, not just $I_{L,pk}$, so a short circuit does not saturate the core.</li>
<li><strong>Capacitor DC bias.</strong> A 22 µF 6.3 V 0805 X5R capacitor may give under 10 µF at 5 V. Use the manufacturer’s bias curve.</li>
<li><strong>Layout.</strong> The input loop (Cin, high-side and low-side switch) carries the pulsed current; keep it as small as possible. It sets the switch-node ringing and EMI more than any value on this page.</li>
<li><strong>Compensation.</strong> Changing L or Cout moves the LC double pole and the ESR zero. With an internally compensated controller stay within the datasheet’s recommended L·C range (SLVA477 §7).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>B. Hauke, “Basic Calculation of a Buck Converter’s Power Stage,” Texas Instruments application note SLVA477 (rev. C), 2011–2026.</li>
<li>R. W. Erickson, D. Maksimović, <em>Fundamentals of Power Electronics</em>, 2nd ed., Kluwer/Springer, 2001: ch. 2 (steady-state analysis), ch. 3 (equivalent circuit with losses), §4.3 (switching loss), ch. 5 (discontinuous conduction mode).</li>
<li>L. Balogh, “Fundamentals of MOSFET and IGBT Gate Driver Circuits,” Texas Instruments application report SLUA618.</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, ch. 7 (step-down converter, output ripple).</li>
</ul>`,
    },
  ],
};
