import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Voltage dividers — how this calculator works',
    lead:
      'Two resistors in series across a voltage split it in proportion to their values. The divider is the most common circuit on any board: ADC scaling, regulator feedback, bias networks, level shifting. The equation is simple, but loading, tolerance and the choice of impedance level are what decide whether the design works. This page solves the divider for any one of $V_{in}$, $V_{out}$, $R_1$ or $R_2$, includes an optional load, finds the best standard-value pair and gives the worst-case output.',
  },
  sections: [
    {
      title: 'The divider equation',
      html: `<p>The same current flows through $R_1$ and $R_2$ (Kirchhoff’s current law), so the output across $R_2$ is</p>
$$V_{out} = V_{in}\\,\\frac{R_2}{R_1 + R_2}$$
<p>With a load $R_L$ across the output, $R_2$ is replaced by the parallel combination $R_2' = R_2 \\parallel R_L = R_2R_L/(R_2+R_L)$:</p>
$$V_{out} = V_{in}\\,\\frac{R_2'}{R_1 + R_2'}$$
<p>Currents and powers follow from Ohm’s law: $I_{in} = (V_{in}-V_{out})/R_1$, $P_1 = (V_{in}-V_{out})^2/R_1$, $P_2 = V_{out}^2/R_2$.</p>`,
    },
    {
      title: 'Thévenin equivalent and loading',
      html: `<p>Seen from the output, the divider is a voltage source $V_{th} = V_{in}R_2/(R_1+R_2)$ (the unloaded output) in series with</p>
$$R_{th} = R_1 \\parallel R_2 = \\frac{R_1R_2}{R_1+R_2}$$
<p>A load then sees a second divider, $R_{th}$ against $R_L$:</p>
$$\\frac{V_{out}}{V_{th}} = \\frac{R_L}{R_L + R_{th}} \\quad\\Rightarrow\\quad \\text{error} = -\\frac{R_{th}}{R_L+R_{th}}$$
<p>For less than 1 % error the load must be at least $99\\,R_{th}$; for 0.1 %, $999\\,R_{th}$. The first graph shows this curve, with the worst-case tolerance band around it.</p>
<p>When you give $R_L$ and solve for $R_1$, $R_2$ or $V_{in}$, the solution compensates for the load, so the loaded output hits the target. The “loading error” result tells you how sensitive that output is to the load. If the load varies (a sampling ADC, a temperature-dependent input), lower the impedance or add a buffer.</p>`,
    },
    {
      title: 'Solving for each unknown',
      html: `<p>Every unknown has an exact closed-form inverse of the one forward equation, so a solved value fed back reproduces the target exactly. With $k = V_{out}/V_{in}$:</p>
$$R_1 = R_2'\\left(\\frac{1}{k}-1\\right),\\qquad R_2' = R_1\\frac{k}{1-k},\\quad R_2 = \\frac{R_2'R_L}{R_L - R_2'},\\qquad V_{in} = V_{out}\\frac{R_1+R_2'}{R_2'}$$
<p>A passive divider needs $0 < k < 1$. With a load, $R_2' < R_L$, so the output can never exceed $V_{in}R_L/(R_1+R_L)$. If the target is above that, no $R_2$ works and the page says so.</p>`,
    },
    {
      title: 'Standard values (E-series)',
      html: `<p>Resistors come in the IEC 60063 preferred-number series: E12 (12 values per decade), E24, E48 and E96. Rounding $R_1$ and $R_2$ separately to the nearest standard value can add almost a whole step of error. It is better to search pairs. For every standard $R_2$ that keeps the total resistance within about half a decade of the present design, the page computes the exact $R_1$ and tries the standard values just below and just above it. The pairs are ranked by output error, and the best few are listed in the Tables tab. Because the ratio is what matters, an E24 pair often beats a pair of E96 values rounded independently.</p>`,
    },
    {
      title: 'Tolerance: worst case and RSS',
      html: `<p>$V_{out}$ rises with $R_2$ and falls with $R_1$, so the extremes are</p>
$$V_{out,max} = V_{out}\\big(R_1(1-t),\\,R_2(1+t)\\big),\\qquad V_{out,min} = V_{out}\\big(R_1(1+t),\\,R_2(1-t)\\big)$$
<p>For an unloaded divider the relative sensitivities are $S_{R_2} = -S_{R_1} = 1-k$, so the worst-case error is about $\\pm 2t(1-k)$. A divider that drops only a little ($k$ close to 1) is therefore much less sensitive than a 10:1 divider. The root-sum-square value $\\sqrt{S_1^2+S_2^2}\\,t$ is a typical spread for independent parts and is smaller than the worst case. Resistors from one thin-film network, or a matched pair, track each other, and their ratio tolerance can be ten times better than their absolute tolerance.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Choose the impedance level first.</strong> Larger values waste less current (the third graph), but raise $R_{th}$, noise and errors from leakage and bias current. 10 kΩ – 100 kΩ totals suit most ADC and feedback dividers. Battery monitors that must draw only microamps go to MΩ, usually with a capacitor at the output.</li>
<li><strong>ADC inputs.</strong> A SAR ADC charges its sampling capacitor from $R_{th}$. Check the datasheet’s maximum source impedance, or add a capacitor at the pin that is large compared with the sampling capacitor.</li>
<li><strong>Regulator feedback.</strong> Use the reference voltage as $V_{out}$ and the regulator output as $V_{in}$. Feedback pin bias current flows in $R_{th}$, and some datasheets set a maximum $R_2$ for this reason.</li>
<li><strong>High voltage.</strong> Each chip resistor has a working voltage limit (for example 150 V for an 0805 thick-film part in the Vishay CRCW data). Split $R_1$ into several resistors in series. This also helps with creepage and with the resistor’s voltage coefficient.</li>
<li><strong>Power.</strong> Pick parts rated for about twice their dissipation. Self-heating shifts the value through the TCR (±100 ppm/K is typical for 1 % thick film).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.2.3 (voltage dividers) and §1.2.5 (Thévenin equivalent).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
<li>Vishay Draloric, <em>D/CRCW e3 Standard Thick Film Chip Resistors</em>, document 20035 (rated dissipation and operating voltage by size).</li>
</ul>`,
    },
  ],
};
