import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Heatsink selection — how this calculator works',
    lead:
      'Heat leaving a power device’s junction crosses a chain of thermal resistances — the package, the interface to the heatsink and the heatsink itself — before it reaches the air. In steady state these add like series resistors, with power in place of current and temperature in place of voltage. This page builds that stack, finds the junction temperature, and inverts it for the heatsink thermal resistance, power or ambient that meets a junction-temperature target, as described in TI’s SLVA118A and onsemi’s AN1040.',
  },
  sections: [
    {
      title: 'The series thermal stack',
      html: `<p>For one device dissipating $P$ on its own heatsink,</p>
$$T_J = T_A + P\\,(\\theta_{JC} + \\theta_{CS} + \\theta_{SA})$$
<p>where $\\theta_{JC}$ is the package’s junction-to-case resistance (datasheet), $\\theta_{CS}$ the case-to-sink interface, and $\\theta_{SA}$ the heatsink-to-air resistance (heatsink datasheet). Rearranged for the heatsink, this is SLVA118A eq. 10:</p>
$$\\theta_{SA} \\le \\frac{T_J - T_A}{P} - \\theta_{JC} - \\theta_{CS}$$
<p>If the right-hand side is zero or negative, no heatsink can do the job: the package and interface alone already use up the allowed rise. Then reduce the power, improve the interface, or use a device with lower $\\theta_{JC}$ (bigger die, better package).</p>
<p><strong>Several devices on one heatsink.</strong> With $n$ identical devices each dissipating $P$, the heatsink carries $nP$ and every device sits on the same heatsink temperature, so $T_S = T_A + nP\\,\\theta_{SA}$ and $T_J = T_S + P(\\theta_{JC} + \\theta_{CS})$. Extra series layers (a spreader, a second insulator) add to the device path in the same way.</p>`,
    },
    {
      title: 'The interface θCS',
      html: `<p>Two flat metal surfaces touch only at high points; the gaps are filled with air, a poor conductor. Thermal grease, phase-change material or a conformable pad fills them. An electrically insulating layer (mica, silicone rubber, ceramic) adds its own resistance and a second interface. Measured values from onsemi AN1040 (Table 1, at the recommended screw torque):</p>
<table>
<tr><th>Package</th><th>Dry metal</th><th>Greased metal</th><th>Mica, dry</th><th>Mica, greased</th></tr>
<tr><td>TO-3 (TO-204AA)</td><td>0.5</td><td>0.1</td><td>1.3</td><td>0.36</td></tr>
<tr><td>TO-220AB</td><td>1.2</td><td>1.0</td><td>3.4</td><td>1.6</td></tr>
<tr><td>TO-126</td><td>2.0</td><td>1.3</td><td>4.3</td><td>3.3</td></tr>
</table>
<p>(°C/W.) Dry silicone-rubber pads on a TO-3 measured 0.37–0.79 °C/W with a flat heatsink and roughly twice that on a poorly flat one (AN1040 Table 2), so a good pad can beat greased mica. SLVA118A quotes 0.1–1 °C/W for typical interface materials and up to about 5 °C/W with none. A part soldered to copper (exposed pad, TO-263) has essentially zero θCS. Flatness, torque and TIM thickness matter as much as the material; device datasheets (e.g. “case-to-sink, flat, greased surface”) give their own values.</p>`,
    },
    {
      title: 'Solving for θSA, power or ambient',
      html: `<p>Click ◎ beside $\\theta_{SA}$, $P$ or $T_A$ to make it the unknown. The $T_J$ box then holds the <em>target</em> junction temperature, normally 10–25 °C below the absolute-maximum rating to cover tolerances and ageing. The page finds the unknown by root finding on the same forward stack equation, so a solved value put back in reproduces the target exactly. The “Limits” group always reports the same quantities against the maximum rating. With $T_J$ as the unknown, the page simply analyses the stack you entered and gives a pass/fail verdict.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>θSA is not a constant.</strong> A natural-convection heatsink improves as its temperature rise grows (convection and radiation both increase), and it degrades in a closed box, when mounted horizontally, or when the device sits at the edge rather than the centre. Use the vendor’s curve at your power and airflow.</li>
<li><strong>Use maximum θJC.</strong> Datasheets give typical and maximum; design with the maximum.</li>
<li><strong>Isolate the heatsink, not the device.</strong> When several devices share a heatsink at the same potential, or the heatsink can float, leaving out the insulator removes the largest resistance in many stacks.</li>
<li><strong>Power depends on temperature.</strong> MOSFET on-resistance rises about 1.5–2× from 25 °C to 125 °C; enter the dissipation at the hot junction temperature, or iterate.</li>
<li><strong>Pulses.</strong> For short pulses the junction sees the device’s transient thermal impedance, much lower than θJC; this page uses the average power.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>B. Roehr, “Mounting Considerations for Power Semiconductors,” onsemi application note AN1040/D (Tables 1–3: interface thermal resistance).</li>
<li>B. Hunter, P. Rowland, “Linear Regulator Design Guide for LDOs,” Texas Instruments SLVA118A, 2008, §5 (eq. 8–10, heatsink selection).</li>
<li>JEDEC JESD51-2A, <em>Integrated Circuits Thermal Test Method Environmental Conditions — Natural Convection (Still Air)</em> (θJA); JESD51-14, <em>Transient Dual Interface Test Method for the Measurement of the Thermal Resistance Junction-to-Case</em> (θJC); JESD51-1 (electrical test method for junction temperature).</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics</em>, 3rd ed., Wiley, 2003, ch. 29 (heat sinks and thermal management).</li>
</ul>`,
    },
  ],
};
