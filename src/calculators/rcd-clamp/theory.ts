import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'RCD clamp for a flyback — how this calculator works',
    lead:
      'The leakage inductance of a flyback transformer is not coupled to the secondary, so when the switch turns off its current has nowhere to go but into the drain capacitance. An RCD clamp catches that energy in a capacitor held at a set voltage above the input and burns it in a resistor. This page sizes R, C and the diode for a chosen clamp voltage (or finds the clamp voltage a given R settles at) using the equations of Fairchild AN-4147, and checks the result against the switch rating.',
  },
  sections: [
    {
      title: 'Where the energy goes',
      html: `<p>At turn-off the primary current $I_{pk}$ flows in both the magnetizing and the leakage inductance. The drain rises until the clamp diode conducts at $V_{in} + V_{clamp}$. The secondary then holds the magnetizing inductance at the reflected voltage $V_{OR}$, so the leakage inductance sees $V_{clamp} - V_{OR}$ and its current falls to zero in</p>
$$t_s = \\frac{L_{lk}\\,I_{pk}}{V_{clamp} - V_{OR}}$$
<p>During $t_s$ the diode current falls linearly from $I_{pk}$, so the charge $\\tfrac12 I_{pk} t_s$ enters the capacitor at $V_{clamp}$. The clamp therefore absorbs, per second,</p>
$$P_{clamp} = V_{clamp}\\cdot\\tfrac12 I_{pk} t_s\\, f_{sw} = \\tfrac12 L_{lk} I_{pk}^2 f_{sw}\;\\frac{V_{clamp}}{V_{clamp}-V_{OR}}$$
<p>(AN-4147). It is more than the leakage energy $\\tfrac12 L_{lk}I_{pk}^2$ because, while the leakage resets, part of the magnetizing energy is diverted into the clamp instead of the secondary. As $V_{clamp} \\to V_{OR}$ the factor grows without bound; at $2V_{OR}$ it is 2.</p>`,
    },
    {
      title: 'Resistor, capacitor and diode',
      html: `<p>In steady state the resistor dissipates the clamp power at the capacitor’s (nearly constant) voltage, which fixes R; the capacitor is sized for a peak-to-peak ripple $\\Delta V$ (5–10 % of $V_{clamp}$ is typical):</p>
$$R = \\frac{V_{clamp}^2}{P_{clamp}} = \\frac{2V_{clamp}(V_{clamp}-V_{OR})}{L_{lk}I_{pk}^2 f_{sw}},\\qquad C = \\frac{V_{clamp}}{\\Delta V\\,R\\,f_{sw}}$$
<p>The diode sees the full drain swing in reverse, $V_{RRM} \\ge V_{in,max} + V_{clamp}$, carries $I_{pk}$ peaks with an average of $\\tfrac12 I_{pk} t_s f_{sw}$, and must recover fast (an ultrafast or fast-recovery type; a slow diode lets charge flow back and rings). Rate R for at least twice $P_{clamp}$ and for $V_{clamp}$, and C for $V_{clamp}$ plus the ripple.</p>`,
    },
    {
      title: 'Choosing the clamp voltage',
      html: `<p>The drain peak is $V_{DS,pk} = V_{in,max} + V_{clamp}$, which must stay below the switch rating with margin for ringing (80–90 % of $V_{DSS}$). Lower clamp voltages protect the switch but waste more and, near $V_{OR}$, steal secondary current. AN-4147 suggests a clamp voltage of about 2–2.5 × $V_{OR}$; when the switch rating does not allow that, either reduce $V_{OR}$ (fewer primary turns, at a longer duty), cut the leakage, or accept the higher loss shown in the <em>Loss vs V_clamp</em> graph.</p>`,
    },
    {
      title: 'Solve-for on this page',
      html: `<p>With ◎ on R (default) you choose the clamp voltage and the page returns R. With ◎ on $V_{clamp}$ you enter a resistor and the page finds where the clamp settles: $V_{clamp}^2/R = P_{clamp}(V_{clamp})$ is a quadratic,</p>
$$V_{clamp} = \\tfrac12\\left(V_{OR} + \\sqrt{V_{OR}^2 + 2R\\,L_{lk}I_{pk}^2 f_{sw}}\\right)$$
<p>so both directions are exact inverses. The Tables tab lists the preferred resistors around the answer with the clamp voltage, drain peak and loss each one gives — a larger R raises the clamp voltage.</p>`,
    },
    {
      title: 'What the model leaves out',
      html: `<ul>
<li>$I_{pk}$, $V_{OR}$ and $L_{lk}$ are taken as constant; size at low line and full load (or at the current limit, so a fault does not avalanche the switch).</li>
<li>The drain capacitance, the ringing after $t_s$ and the clamp diode’s reverse recovery are not modelled. In practice measure $V_{DS}$ and adjust R.</li>
<li>The ripple graph neglects R’s discharge during the short $t_s$ interval.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>H.-S. Choi, Fairchild Semiconductor (onsemi), “Design Guidelines for RCD Snubber of Flyback Converters,” application note AN-4147, 2006.</li>
<li>Fairchild Semiconductor (onsemi), “Design Guidelines for Off-line Flyback Converters Using Fairchild Power Switch (FPS),” application note AN-4137.</li>
<li>J. Picard, “Under the Hood of Flyback SMPS Designs,” Texas Instruments Power Supply Design Seminar SLUP254, 2010.</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, §10-4.</li>
</ul>`,
    },
  ],
};
