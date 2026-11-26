import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'I²C pull-up resistors — how this calculator works',
    lead:
      'I²C devices only ever pull SDA and SCL low. A pull-up resistor brings each line back high, charging the bus capacitance as it does. The resistor therefore has two limits. It must be small enough that the line rises within the time the bus speed allows, and large enough that the weakest device can still pull the line low against it. This page computes both limits as defined in the NXP I²C-bus specification (UM10204) and recommends a standard value between them.',
  },
  sections: [
    {
      title: 'Upper limit: rise time',
      html: `<p>When every driver releases the line, it charges through $R_p$ like an RC circuit: $V(t) = V_{DD}(1 - e^{-t/R_pC_b})$. The specification measures rise time between the input thresholds $V_{IL} = 0.3V_{DD}$ and $V_{IH} = 0.7V_{DD}$:</p>
$$t_r = t_{0.7} - t_{0.3} = R_pC_b\\,\\ln\\frac{1-0.3}{1-0.7} = \\ln\\tfrac{7}{3}\\,R_pC_b = 0.8473\\,R_pC_b$$
<p>so for a maximum rise time $t_r$ (UM10204 Table 11)</p>
$$R_{p(max)} = \\frac{t_r}{0.8473\\,C_b}$$
<table class="kv" style="max-width:560px"><tr><th>Mode</th><th>$f_{SCL}$</th><th>$t_r$ max</th><th>$C_b$ max</th><th>$I_{OL}$ at 0.4 V</th></tr>
<tr><td>Standard-mode</td><td>100 kHz</td><td>1000 ns</td><td>400 pF</td><td>3 mA</td></tr>
<tr><td>Fast-mode</td><td>400 kHz</td><td>300 ns</td><td>400 pF</td><td>3 mA (or 6 mA at 0.6 V)</td></tr>
<tr><td>Fast-mode Plus</td><td>1 MHz</td><td>120 ns</td><td>550 pF</td><td>20 mA</td></tr></table>`,
    },
    {
      title: 'Lower limit: sink current',
      html: `<p>When a device pulls the line low, it has to sink the pull-up current and still reach a low enough voltage. The specification guarantees $V_{OL} \\le 0.4$ V while sinking 3 mA (Standard- and Fast-mode) or 20 mA (Fast-mode Plus), for $V_{DD} > 2$ V. At lower supplies it guarantees $V_{OL} \\le 0.2V_{DD}$ at 2 mA. Hence</p>
$$R_{p(min)} = \\frac{V_{DD(max)} - V_{OL(max)}}{I_{OL}}$$
<p>Use the highest supply voltage. The specification’s own example uses 5 V ± 10 %, which gives $(5.5 - 0.4)/3\\text{ mA} = 1.7$ kΩ and limits the bus to about 200 pF at Fast-mode. The second example on this page reproduces it. Fast-mode also lists a stronger condition, $I_{OL} \ge 6$ mA at $V_{OL} = 0.6$ V (Table 10, note [4]), which is what a full 400 pF bus at 400 kHz needs. Select it only if every device on the bus meets it. If one device on your bus has a weaker output than the specification minimum, choose Custom and enter its $V_{OL}$ and $I_{OL}$. The page warns when $V_{OL}$ exceeds $0.2V_{DD}$, which would eat into the 0.1·$V_{DD}$ low-level noise margin (Table 11).</p>`,
    },
    {
      title: 'Second upper limit: input leakage',
      html: `<p>Each I/O pin may draw up to $I_i = 10$ µA when the line is high (Table 10). That current flows through $R_p$ and lowers the high level. The bus must keep the high-level noise margin of $0.2V_{DD}$ (Table 11) above $V_{IH} = 0.7V_{DD}$, so the line has to stay at or above $0.9V_{DD}$ (§7.4, Figure 47):</p>
$$N\,I_i\,R_p \le 0.1\,V_{DD(min)} \quad\Rightarrow\quad R_{p(max,leak)} = \frac{0.1\,V_{DD(min)}}{N \cdot 10\ \mu\text{A}}$$
<p>With 4 devices on a 3.3 V ±5 % bus this is 7.8 kΩ. It matters on small, slow buses, where the rise-time limit alone would allow tens of kΩ. The page uses the smaller of the two upper limits. Real CMOS inputs usually leak well under 1 µA, so this limit is conservative.</p>`,
    },
    {
      title: 'Choosing the value',
      html: `<p>Any resistor between the limits meets the specification. The page recommends the largest standard value whose tolerance band stays below the rise-time $R_{p(max)}$ reduced by a margin (20 % by default), below the leakage limit, and above $R_{p(min)}$:</p>
<ul>
<li>The largest value draws the least current and dissipates the least power while the line is low. The specification itself suggests the upper end of the range for battery-powered designs.</li>
<li>The margin covers the usual uncertainty in $C_b$. Capacitance is hard to estimate, and a rise-time measurement on the real bus is the final check.</li>
</ul>
<p>If no standard value leaves the margin, the page picks the smallest valid value (the fastest edge) and warns. If no value of the chosen series and tolerance fits the window at all, it says so and names a finer series or tighter tolerance that does fit. If $R_{p(min)} > R_{p(max)}$ there is no valid resistor at all, and the page reports which limit closes the window.</p>
<p>The ◎ buttons switch between three questions. <em>Rp</em>: recommend a pull-up for this capacitance. <em>C_b</em>: how much capacitance a given pull-up can drive at this speed. <em>t_r</em>: the rise time and a spec check for a given pull-up and capacitance.</p>`,
    },
    {
      title: 'Estimating bus capacitance',
      html: `<ul>
<li><strong>Device pins:</strong> up to 10 pF each (UM10204 Table 10). Multiplexers and switches may be more.</li>
<li><strong>PCB traces:</strong> roughly 0.5–1 pF per cm over a ground plane.</li>
<li><strong>Cable:</strong> 50–100 pF per metre for twisted pair or ribbon. Long runs quickly use up the 400 pF budget.</li>
<li><strong>Probes and connectors:</strong> a 10× scope probe adds about 10–15 pF.</li>
</ul>
<p>A good check is to measure the 30 %→70 % rise time and compute $C_b = t_r/(0.8473\\,R_p)$, which is what solving for $C_b$ does with the spec limit.</p>`,
    },
    {
      title: 'When the window closes',
      html: `<p>For long or heavily loaded buses, UM10204 §7.2 lists several options:</p>
<ul>
<li>Divide the bus with a buffer, so each segment sees less capacitance.</li>
<li>Use a switched pull-up, which switches a second, smaller resistor in parallel during the rising edge (§7.2.4).</li>
<li>Use a current-source pull-up. It charges the bus at a constant slope, roughly 2× faster than a resistor drawing the same current.</li>
<li>For Fast-mode, use devices that meet the 6 mA at 0.6 V sink condition.</li>
<li>Use Fast-mode Plus drivers (20 mA) to allow a smaller $R_p$ (VDD > 2 V).</li>
<li>Lower the clock rate.</li>
</ul>
<p>Series resistors at the pins (for protection) slow the falling edge and raise $V_{OL}$. They are not modelled here.</p>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>NXP Semiconductors, <em>UM10204 I²C-bus specification and user manual</em>, Rev. 7.0, 1 October 2021: Table 10 (I/O stage characteristics, including IOL at 0.6 V and Ii), Table 11 (bus-line timing, capacitance and noise margins), §7.1 (pull-up resistor sizing, equations 1 and 2), §7.2 (operating above the maximum bus capacitance), §7.4 and Figure 47 (input leakage).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
