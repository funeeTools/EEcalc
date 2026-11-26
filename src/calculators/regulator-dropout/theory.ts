import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Regulator dropout — how this calculator works',
    lead:
      'A linear regulator can only take voltage away. It holds its output as long as the input stays above the output by at least the dropout voltage of its pass element; below that, the output follows the input down. This page works out the dropout at your load current, finds the lowest input your source can deliver (low line, ripple valley or a nearly flat battery), and reports the margin between the two, or solves for the largest load, the highest output, the smallest supply or the cut-off cell voltage that keeps a chosen margin.',
  },
  sections: [
    {
      title: 'The headroom condition',
      html: `<p>The regulator stays in regulation while</p>
$$V_{in,min} \\ge V_{out} + V_{DO}(I_{out})$$
<p>where $V_{in,min}$ is the lowest <em>instantaneous</em> input. The headroom margin is the difference, $\\Delta V = V_{in,min} - V_{out} - V_{DO}(I_{out})$. TI defines the dropout voltage as the input–output difference at which the regulator stops regulating (the output has fallen by a stated amount, often 100 mV or 2–3 %, below nominal) [SLVA079].</p>`,
    },
    {
      title: 'Dropout models',
      html: `<p>The dropout depends on the pass element and the load current:</p>
<ul>
<li><strong>MOS pass (PMOS / NMOS LDO).</strong> In dropout the pass transistor is fully on and behaves like a resistor, so $V_{DO} = R_{DS(on)}\\,I_{out}$. One data-sheet point ($V_{DO}$ at the rated current) gives $R_{DS(on)} = V_{DO,1}/I_1$, and the dropout scales linearly down to zero at no load.</li>
<li><strong>Two data-sheet points.</strong> A straight line through two specified dropouts, $V_{DO} = V_{DO,1} + (I - I_1)\\,\\frac{V_{DO,2} - V_{DO,1}}{I_2 - I_1}$. This suits bipolar (PNP) LDOs, whose saturation voltage rises with current but does not start at zero. It is only reliable between the two points.</li>
<li><strong>Fixed.</strong> Regulators with an NPN or Darlington pass device (78xx, LM317) need about two base–emitter drops plus a saturation voltage: roughly 2–3 V almost regardless of load.</li>
</ul>
<p>All three grow with junction temperature, so use the data-sheet maximum at your hottest operating point.</p>`,
    },
    {
      title: 'The lowest input',
      html: `<p>For a DC supply of average value $V_{in}$, tolerance $t$ and peak-to-peak ripple $V_{pp}$:</p>
$$V_{in,min} = V_{in}(1 - t) - \\frac{V_{pp}}{2}, \\qquad V_{in,max} = V_{in}(1 + t) + \\frac{V_{pp}}{2}$$
<p>The ripple valley matters most after a rectifier and bulk capacitor: the regulator drops out for a moment on every cycle, and the output then carries a ripple notch even though the average input looks ample. For a battery of $n$ cells, $V_{in,min} = n\\,V_{end}$ (end of discharge, under load) and $V_{in,max} = n\\,V_{full}$. The cell voltage at which the regulator drops out is $(V_{out} + V_{DO})/n$; if that is above the nominal plateau, most of the capacity is unusable.</p>`,
    },
    {
      title: 'Power and efficiency',
      html: `<p>The regulator passes the load current and burns the difference, plus its own ground current from the input:</p>
$$P_D = (V_{in} - V_{out})\\,I_{out} + V_{in}\\,I_{GND}, \\qquad \\eta = \\frac{V_{out}\\,I_{out}}{V_{in}\\,(I_{out} + I_{GND})}$$
<p>The worst dissipation is at the highest input; the typical efficiency at the nominal input. For the junction temperature, take $P_D$ to the LDO thermal page.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>In analysis the margin is computed. Click ◎ on another quantity and the margin box becomes the target (0 means exactly at dropout):</p>
<ul>
<li><strong>Load current:</strong> the largest $I_{out}$ with $V_{DO}(I_{out}) = V_{in,min} - V_{out} - \\Delta V$ (needs a load-dependent model).</li>
<li><strong>Output voltage:</strong> $V_{out} = V_{in,min} - V_{DO}(I_{out}) - \\Delta V$.</li>
<li><strong>Supply:</strong> $V_{in} = (V_{out} + V_{DO} + \\Delta V + V_{pp}/2)/(1 - t)$.</li>
<li><strong>Cell voltage:</strong> $V_{end} = (V_{out} + V_{DO} + \\Delta V)/n$.</li>
</ul>
<p>Every model is linear in these quantities, so the inverses are exact.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Keep some margin. Close to dropout the loop gain collapses: power-supply rejection and load-transient response get much worse long before the output actually falls.</li>
<li>Subtract the drops ahead of the regulator: cable and connector resistance, a reverse-polarity diode or MOSFET, the battery’s internal resistance at the load current.</li>
<li>USB VBUS is 5 V ±5 % at the host connector, and lower at the device end after cable drop; a 3.3 V LDO with 300 mV dropout has little to spare at the bottom of that range.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>B. S. Lee, <em>Understanding the Terms and Definitions of LDO Voltage Regulators</em>, Texas Instruments application report SLVA079, 1999 — dropout voltage, ground current, efficiency.</li>
<li>Texas Instruments, <em>Digital Designer’s Guide to Linear Voltage Regulators and Thermal Management</em>, application report SLVA118A — dissipation and efficiency equations.</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, ch. 9 (linear regulators, low-dropout pass elements).</li>
<li>D. Linden, T. B. Reddy, <em>Handbook of Batteries</em>, 4th ed., McGraw-Hill, 2011 — nominal and end-of-discharge cell voltages.</li>
<li>USB Implementers Forum, <em>Universal Serial Bus Specification</em>, rev. 2.0, §7.2.1 (VBUS voltage).</li>
</ul>`,
    },
  ],
};
