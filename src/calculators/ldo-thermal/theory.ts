import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'LDO thermal design — how this calculator works',
    lead:
      'A linear regulator keeps its output constant by burning the difference between input and output voltage in its pass transistor. All of that power becomes heat, and the junction temperature it produces — not the current rating — is usually what limits a linear regulator. This page computes the dissipation and the steady-state junction temperature from a single junction-to-ambient thermal resistance, following TI’s linear-regulator thermal guide (SLVA118A), and inverts the same equations for the largest load, ambient, input voltage or θJA that still meets a junction-temperature target.',
  },
  sections: [
    {
      title: 'Dissipation',
      html: `<p>The input current is the load current plus the regulator’s own ground (quiescent) current, $I_{in} = I_{out} + I_{GND}$. The power not delivered to the load is dissipated in the regulator:</p>
$$P_D = P_{in} - P_{out} = (V_{in} - V_{out})\\,I_{out} + V_{in}\\,I_{GND}$$
<p>The first term is the pass element; the second (SLVA118’s $P_Q$) is usually small — 56 µW against 80 mW in SLVA118’s TPS78925 example — but it is not always: bipolar (PNP or NPN-pass) regulators draw a ground current that rises with load, sometimes to several percent of $I_{out}$. Read $I_{GND}$ at your load current from the datasheet curve.</p>
<p>Efficiency follows directly (SLVA118 eq. 16):</p>
$$\\eta = \\frac{V_{out} I_{out}}{V_{in}\\,(I_{out} + I_{GND})} \\;\\le\\; \\frac{V_{out}}{V_{in}}$$`,
    },
    {
      title: 'Junction temperature',
      html: `<p>In steady state the heat flows from the die to the surrounding air through a thermal resistance $\\theta_{JA}$ (°C/W), so</p>
$$T_J = T_A + P_D\\,\\theta_{JA}\\qquad\\Longleftrightarrow\\qquad \\theta_{JA,max} = \\frac{T_{J,max} - T_A}{P_D}$$
<p>(SLVA118 eq. 6–7). The second form answers “which package can I use?”: any package whose $\\theta_{JA}$ on your board is below $\\theta_{JA,max}$ works.</p>
<p><strong>What θJA really is.</strong> Datasheet θJA is measured on a standard JEDEC test board (JESD51-7 high-K: 76 × 114 mm, four layers with two solid planes) in still air (JESD51-2A). It describes that board as much as the package. On a two-layer board with little copper the real value can be 1.5–3× higher; with a large plane and thermal vias under an exposed pad it can be lower. TI’s SPRA953 explains why θJA should be used to compare packages rather than to predict an absolute temperature. The package presets on this page are rounded typical high-K values — SLVA118 fig. 5 shows ranges as wide as 97–178 °C/W for SOIC-8 — so enter your datasheet’s value whenever you have it.</p>`,
    },
    {
      title: 'Dropout and the usable input range',
      html: `<p>The regulator needs at least its dropout voltage $V_{DO}$ across the pass element to regulate; below that, $V_{out}$ simply follows $V_{in} - V_{DO}$ (SLVA118 §8.2). The thermal limit sets the other end. Together they give a window:</p>
$$V_{out} + V_{DO} \\;\\le\\; V_{in} \\;\\le\\; \\frac{(T_{J,max} - T_A)/\\theta_{JA} + V_{out} I_{out}}{I_{out} + I_{GND}}$$
<p>A low dropout is useful because it lets you run with $V_{in}$ close to $V_{out}$, which is also where dissipation is lowest. Dropout grows with load current and temperature, so use the datasheet value at your worst case. In dropout the page computes the dissipation and efficiency with the actual output $V_{in} - V_{DO}$, so the pass element drops $V_{DO}$.</p>`,
    },
    {
      title: 'Solving for current, ambient, Vin or θJA',
      html: `<p>In analysis mode the page computes $T_J$. Click ◎ beside $I_{out}$, $T_A$, $V_{in}$ or $\\theta_{JA}$ to make it the unknown: the $T_J$ box becomes the <em>target</em> junction temperature, and the page finds the value that reaches it by root finding on the same $T_J$ equation. If the answer lies beyond the input’s own limit (e.g. more than 100 A or 1000 V), the page reports it as not thermally limiting instead of a number; a maximum load current is also capped at the rated current when one is entered. Using a target below the absolute maximum is the derating practice of SLVA118 §7.3 (its example 2 derates 125 °C to 115 °C). The “Limits” group always reports the same quantities against the maximum rating, and the derating graph shows the maximum load across ambient temperature.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Use the worst case.</strong> Highest $V_{in}$ (with tolerance), lowest $V_{out}$, highest steady load and hottest ambient inside the enclosure, as in SLVA118’s examples.</li>
<li><strong>Copper is the heatsink.</strong> For surface-mount packages the exposed pad or tab must be soldered to a copper area with vias to inner planes. Doubling the copper area can reduce θJA substantially; the datasheet usually has a θJA-versus-area curve.</li>
<li><strong>Share the drop.</strong> A resistor in series with the input (sized so the LDO stays out of dropout at maximum load) moves part of the dissipation off the regulator.</li>
<li><strong>Consider a switcher.</strong> When $V_{out}/V_{in}$ is low and the current is high, efficiency is poor whatever the package; a buck converter dissipates a fraction of the power.</li>
<li><strong>Thermal shutdown is not a design margin.</strong> It protects the part (typically 150–165 °C) but cycling through it is not normal operation.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>B. Hunter, P. Rowland, “Linear Regulator Design Guide for LDOs,” Texas Instruments application report SLVA118A, 2003 (rev. 2008).</li>
<li>Texas Instruments, “Semiconductor and IC Package Thermal Metrics,” application report SPRA953.</li>
<li>JEDEC JESD51-2A, <em>Integrated Circuits Thermal Test Method Environmental Conditions — Natural Convection (Still Air)</em>, 2008; JESD51-7, <em>High Effective Thermal Conductivity Test Board for Leaded Surface Mount Packages</em>, 1999.</li>
<li>Texas Instruments, “Understanding the Terms and Definitions of LDO Voltage Regulators,” application report SLVA079.</li>
</ul>`,
    },
  ],
};
