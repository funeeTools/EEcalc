import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'MOSFET losses in a hard-switched converter — how this calculator works',
    lead:
      'A converter MOSFET heats up for two reasons: current through its on-resistance, and the brief overlap of voltage and current each time it switches. This page adds up the conduction, switching, output-capacitance, reverse-recovery, dead-time and gate losses of one FET in a buck, boost or similar leg, then finds the junction temperature with the on-resistance evaluated at that temperature. The switching estimate follows Balogh’s gate-charge method (TI SLUA618); the current waveforms follow Erickson & Maksimović.',
  },
  sections: [
    {
      title: 'Current through the switch',
      html: `<p>In continuous conduction the switch carries the inductor current, a trapezoid of mean $I_L$ and peak-to-peak ripple $\\Delta I_L$, for its share of the period ($D$ for the control switch, $1-D$ for the synchronous rectifier). Its RMS value is</p>
$$I_{D,rms} = \\sqrt{D_{sw}\\left(I_L^2 + \\frac{\\Delta I_L^2}{12}\\right)}$$
<p>The control switch turns on at the valley $I_L - \\Delta I_L/2$ and off at the peak $I_L + \\Delta I_L/2$. For a buck, $I_L$ is the load current and $V_{sw} = V_{in}$; for a boost, $I_L$ is the input current and $V_{sw} = V_{out}$ plus the rectifier drop.</p>`,
    },
    {
      title: 'Conduction loss and temperature',
      html: `<p>$P_{cond} = I_{D,rms}^2\\,R_{DS(on)}(T_J)$. On-resistance rises with temperature; datasheets plot it normalized to 25 °C. A straight line through that curve,</p>
$$R_{DS(on)}(T_J) = R_{25}\\,\\bigl(1 + \\alpha\\,(T_J - 25\\,^\\circ\\text{C})\\bigr),$$
<p>with $\\alpha$ typically 0.4–0.8 %/°C, fits the 25–125 °C range well (the real curve bends upward, so above 125 °C the line is slightly optimistic). Use the <em>maximum</em> $R_{DS(on)}$ at your gate-drive voltage.</p>`,
    },
    {
      title: 'Switching loss from gate charge',
      html: `<p>With an inductive load clamped by a rectifier, the FET switches in two stages (Balogh, SLUA618 intervals 2 and 3). At turn-on the gate climbs from $V_{th}$ to the Miller plateau</p>
$$V_{pl} = V_{th} + \\frac{I}{g_{fs}}\\qquad(\\text{SLUA618 eq. 8})$$
<p>while the drain current rises to $I$ at full voltage; then the gate sits on the plateau while the drain voltage falls. The gate currents are set by the drive voltage and the resistances in the gate loop, $R_{on} = R_{src} + R_{G,ext} + R_{G,int}$ (pull-up) and $R_{off} = R_{snk} + R_{G,ext} + R_{G,int}$ (pull-down):</p>
$$I_{G2} = \\frac{V_{drv} - \\tfrac12(V_{pl}+V_{th})}{R_{on}},\\qquad I_{G3} = \\frac{V_{drv} - V_{pl}}{R_{on}}\\qquad(\\text{eq. 11})$$
<p>The current transition moves $Q_{gs2} = Q_{gs} - Q_{g(th)}$ and the voltage transition moves the Miller charge $Q_{gd}$, so $t_{ri} = Q_{gs2}/I_{G2}$ and $t_{vf} = Q_{gd}/I_{G3}$. SLUA618 writes these as $C_{iss}\\Delta V$ and $C_{rss}V$; the datasheet charges are the same integrals measured on the real, voltage-dependent capacitances, so they are used here. Turn-off runs the same intervals in reverse with the gate discharging through $R_{off}$ from the plateau: $I_{G3} = V_{pl}/R_{off}$, $I_{G2} = \\tfrac12(V_{pl}+V_{th})/R_{off}$. With linear edges each transition dissipates half the V·I product over its duration:</p>
$$P_{sw} = \\tfrac12 V_{sw}\\left[I_{on}(t_{ri}+t_{vf}) + I_{off}(t_{vr}+t_{fi})\\right] f_{sw}\\qquad(\\text{eq. 13–14})$$
<p>SLUA618 calls this a crude estimate: source inductance slows the current edge, loop inductance speeds the voltage edge at turn-on and causes overshoot at turn-off. Expect ±30 % and use a measurement or a vendor loss model for the final design.</p>`,
    },
    {
      title: 'Capacitive, recovery, dead-time and gate losses',
      html: `<ul>
<li><strong>Output capacitance.</strong> At a hard turn-on the energy stored in $C_{oss}$ is dumped into the channel: $P_{C_{oss}} = \\tfrac12 C_{oss,eff} V_{sw}^2 f_{sw}$. $C_{oss}$ falls steeply with voltage, so the small-signal value at the test voltage underestimates; $Q_{oss}/V$ from the datasheet is a slightly conservative energy-equivalent value.</li>
<li><strong>Reverse recovery.</strong> When the control switch turns on, it must first sweep out the stored charge $Q_{rr}$ of the opposite rectifier at full voltage, adding $Q_{rr}V_{sw}f_{sw}$ to its loss (Erickson & Maksimović ch. 4, diode recovered charge). A Schottky or GaN rectifier has essentially none. The datasheet $Q_{rr}$ is at a stated $di/dt$ and rises with it.</li>
<li><strong>Synchronous rectifier.</strong> Its channel switches at nearly zero voltage, so its switching loss is negligible. During each dead time its body diode carries the inductor current: $P_{bd} = V_{SD}\\,t_{dt}\\,f_{sw}\\,(I_{pk} + I_{valley})$.</li>
<li><strong>Gate drive.</strong> Each cycle the driver delivers $Q_g V_{drv}$; this power is shared by the driver, the external resistor and the FET’s internal gate resistance in proportion to their resistances (SLUA618 eq. 10). Only the $R_{G,int}$ share heats the die.</li>
<li><strong>Negative current.</strong> If $\\Delta I_L > 2I_L$ the valley current is negative: the switch node is already at $V_{sw}$ when the control switch turns on, so the turn-on, $C_{oss}$ and recovery terms vanish.</li>
</ul>`,
    },
    {
      title: 'Junction temperature and thermal runaway',
      html: `<p>In steady state $T_J = T_A + R_\\theta P_D(T_J)$ with $R_\\theta = R_{\\theta JA}$ for a board-mounted part, or $R_{\\theta JC} + R_{\\theta CS} + R_{\\theta SA}$ with a heatsink. Only the conduction loss depends on $T_J$ here, so the equation is linear and solves exactly:</p>
$$T_J = \\frac{T_A + R_\\theta\\,[P_{other} + P_{cond,25}(1 - 25\\alpha)]}{1 - R_\\theta\\,\\alpha\\,P_{cond,25}}$$
<p>When $R_\\theta\\,\\alpha\\,P_{cond,25} \\ge 1$, every degree of heating adds more loss than the thermal path removes: there is no steady state (thermal runaway) and the page says so. $R_{\\theta JA}$ of a surface-mount part depends mostly on the copper area around it; the datasheet value is for its own test board.</p>`,
    },
    {
      title: 'Solve for',
      html: `<ul>
<li><strong>Junction temperature</strong> (analysis): losses and $T_J$ from the entered design.</li>
<li><strong>Maximum current</strong> or <strong>maximum switching frequency</strong>: the junction-temperature field becomes the target and the page finds the current or frequency that reaches it by root finding on the same model. The current is also capped by the gate drive: the plateau at the peak current must stay below $V_{drv}$.</li>
<li><strong>Required $R_{\\theta JA}$ or heatsink $R_{\\theta SA}$</strong>: the loss at the target temperature is known directly, so $R_\\theta = (T_J - T_A)/P_D(T_J)$.</li>
</ul>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Pick the FET for the balance of conduction and switching loss: at high $V_{sw}$ and $f_{sw}$ a smaller die (lower $Q_{gd}$) wins; at high current and low frequency a lower $R_{DS(on)}$ does.</li>
<li>Check the losses at the highest input voltage (switching) and the lowest (conduction, for a boost) and at the highest ambient.</li>
<li>Keep the steady $V_{DS}$ at or below about 80 % of $V_{DSS}$: the turn-off overshoot from loop inductance comes on top. A snubber or a tighter layout reduces it.</li>
<li>Typical values for charges and thresholds are used; for a worst-case estimate use the maximum $R_{DS(on)}$ (as here) and raise $Q_{gd}$ by the datasheet spread.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>L. Balogh, “Fundamentals of MOSFET and IGBT Gate Driver Circuits,” Texas Instruments SLUA618A, 2017 (rev. 2018), eq. 8 (Miller plateau), 10 (gate-drive power), 11–14 (switching times and loss).</li>
<li>R. W. Erickson and D. Maksimović, <em>Fundamentals of Power Electronics</em>, 3rd ed., Springer, 2020: ch. 4 (switching loss, diode recovered charge), Appendix A (RMS of piecewise-linear waveforms).</li>
<li>N. Mohan, T. Undeland, W. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, ch. 22 and 29 (MOSFET switching, heat sinks).</li>
<li>Texas Instruments datasheets CSD17578Q5A, CSD18540Q5B (SLPS488B) and CSD19534Q5A: preset values and normalized R_DS(on)-vs-temperature curves.</li>
</ol>`,
    },
  ],
};
