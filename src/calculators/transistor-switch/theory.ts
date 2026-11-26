import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Transistor switches — how this calculator works',
    lead:
      'A logic pin cannot drive a relay, a lamp or an LED strip directly, but it can switch a transistor that does. This page sizes the low-side switch: for an NPN BJT, the base resistor that keeps it hard in saturation with margin over the minimum datasheet gain; for an N-channel MOSFET, the on-resistance at your gate voltage, the conduction and switching losses, and a gate resistor for a chosen edge time. It also draws the flyback diode an inductive load needs.',
  },
  sections: [
    {
      title: 'BJT switch',
      html: `<p>A switch should sit in saturation, where $V_{CE}$ is a few hundred millivolts and nearly independent of the gain. That needs more base current than $I_C/h_{FE}$: designers pick a <em>forced gain</em> $\\beta_F = I_C/I_B$ well below the minimum $h_{FE}$, typically 10, which is also the condition at which datasheets guarantee $V_{CE(sat)}$ and $V_{BE(sat)}$.</p>
$$I_L = \\frac{V_{CC} - V_F - V_{CE(sat)}}{R_L},\\qquad I_B = \\frac{I_L}{\\beta_F},\\qquad R_B = \\frac{V_{drive} - V_{BE(sat)}}{I_B}$$
<p>The <em>overdrive</em> $h_{FE,min}/\\beta_F$ says how far into saturation the worst part is: below 1 a minimum-gain transistor stays in the active region, with a large $V_{CE}$ and dissipation. The page takes $V_{CE(sat)}$ and $V_{BE(sat)}$ (maximum values) from the datasheet test point at or above the load current, and the smaller of the minimum $h_{FE}$ values around it. When solving for $R_B$ it takes the next standard value down, which only adds base current.</p>
<p>Dissipation: $P_Q = V_{CE(sat)}I_L + V_{BE(sat)}I_B$.</p>`,
    },
    {
      title: 'MOSFET switch',
      html: `<p>A MOSFET switch is a resistor once it is fully enhanced: $I_L = (V_{CC}-V_F)/(R_L + R_{DS(on)})$ and $P_{cond} = I_L^2R_{DS(on)}$. The datasheet guarantees $R_{DS(on)}$ only at the gate voltages it lists, so the page uses the maximum value at the highest listed $V_{GS}$ not above your drive, and flags a drive below all of them. “Logic level” parts specify 2.5 V or 4.5 V; a part specified only at 10 V is not a 3.3 V switch, whatever its threshold.</p>
<p><strong>Edge times from gate charge.</strong> During each transition the gate voltage sits on the Miller plateau $V_{pl}$ while the driver moves the gate–drain charge $Q_{gd}$. With the linear estimate $V_{pl} \\approx V_{th} + I_L/g_{fs}$ and total gate resistance $R_{G,tot} = R_G + R_{drv} + R_{G,int}$:</p>
$$t_{on} \\approx \\frac{Q_{gd}R_{G,tot}}{V_{drive} - V_{pl}},\\qquad t_{off} \\approx \\frac{Q_{gd}R_{G,tot}}{V_{pl}}$$
<p>The threshold spreads from part to part, and each edge is evaluated where it is slow: turn-on with $V_{th,max}$ (the highest plateau leaves the least drive), turn-off with $V_{th,min}$ (the lowest plateau). Solving for $R_G$ inverts the slower of the two exactly and then takes the next standard value down, so the edge is at most the target. For PWM at $f$ the switching loss depends on the load. With a clamped inductive load the full current flows while the voltage swings, and with a resistive load voltage and current ramp together ($\\int v\\,i\\,dt = VIt/6$ per edge):</p>
$$P_{sw,ind} \\approx \\tfrac12 V_{off}I_L(t_{on}+t_{off})f,\\qquad P_{sw,res} \\approx \\tfrac16 V_{off}I_L(t_{on}+t_{off})f,\\qquad P_G = Q_gV_{drive}f$$
<p>The inductive figure leaves out the current-rise interval before the plateau, so it is a lower bound.</p>
<p>These are first-order estimates (they ignore the current-rise interval, the voltage dependence of $Q_{gd}$ and the source inductance); expect the real edges within a factor of about two.</p>`,
    },
    {
      title: 'Inductive loads and the flyback diode',
      html: `<p>A relay coil, solenoid or motor stores energy $\\tfrac12LI^2$. When the switch opens, the current must keep flowing; without a path it raises the coil voltage until something breaks down, usually the transistor. A diode across the coil (cathode to $V_{CC}$) gives the current a path and clamps the switch at about $V_{CC} + 0.7$ V. The price is a slower release, because the coil current decays slowly through the diode. A zener in series with the diode speeds the release; the switch then has to withstand $V_{CC} + V_Z$.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Pin current.</strong> Microcontroller pins source 4–20 mA, and their $V_{OH}$ drops at the upper end. A BJT switching several hundred milliamps needs more base current than that: use a MOSFET or a Darlington.</li>
<li><strong>Keep it off at reset.</strong> A pull-down from base or gate to the emitter or source (10–100 kΩ) holds the switch off while the pin is high-impedance.</li>
<li><strong>BJT storage time.</strong> A deeply saturated BJT takes hundreds of nanoseconds to turn off. Fine for relays; poor for PWM above a few kHz.</li>
<li><strong>Thermal reality.</strong> SOT-23 power ratings assume a copper pad on a test board; a minimum-pad part may handle half. A TO-220 without a heatsink manages only a couple of watts.</li>
<li><strong>Gate resistor.</strong> Besides setting the edge rate (EMI), it damps ringing between the gate capacitance and the trace inductance; 10–100 Ω is common from a logic pin.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015: §2.2.1 (the transistor switch), ch. 3 (MOSFET switches, gate charge), §1.6.7 (inductive kick).</li>
<li>L. Balogh, <em>Fundamentals of MOSFET and IGBT Gate Driver Circuits</em>, Texas Instruments application report SLUA618, 2017 (Miller plateau, switching intervals, gate-drive power).</li>
<li>onsemi datasheets 2N3903/2N3904 and P2N2222A; Alpha &amp; Omega AO3400A; Infineon IRLML2502 and IRLZ44N.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
