import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Critical trace length — how this calculator works',
    lead:
      'A trace stops behaving like a plain wire once a signal edge takes a noticeable fraction of its rise time to travel along it: then reflections from the far end arrive while the edge is still changing, and the line must be routed with controlled impedance and terminated. This page compares the trace delay with the rise time, using the propagation delay of the routing layer and a criterion $k$ you choose.',
  },
  sections: [
    {
      title: 'Delay, edge length and the criterion',
      html: `<p>A signal travels at $v = c/\\sqrt{\\varepsilon_{eff}}$, so each metre of trace adds a delay</p>
$$t_{pd} = \\frac{\\sqrt{\\varepsilon_{eff}}}{c}$$
<p>and a trace of length $L$ has a one-way delay $TD = L\\,t_{pd}$. Johnson and Graham picture the rising edge spread out along the line: an edge of 10–90 % rise time $t_r$ occupies a length</p>
$$l_{edge} = \\frac{t_r}{t_{pd}}$$
<p>of copper. If the trace is short against $l_{edge}$, the whole trace rises almost together and behaves as a lumped capacitance; if it is comparable or longer, a step travels down it and reflects. The page calls the trace lumped while</p>
$$TD < \\frac{t_r}{k} \\quad\\Longleftrightarrow\\quad L < L_{crit} = \\frac{t_r}{k\\,t_{pd}} = \\frac{l_{edge}}{k}$$
<p>The strip above the board in the drawing shows exactly this: the edge spread out along the line at the moment its front reaches the receiver, with the trace and $L_{crit}$ marked on the same scale, so you can see what fraction of the edge the trace holds.</p>`,
    },
    {
      title: 'Which k?',
      html: `<p>There is no single physical threshold — reflections grow gradually as the trace gets longer — so books and application notes pick different fractions. The common ones:</p>
<ul>
<li><b>k = 2</b>: the round-trip delay equals the rise time, $2\\,TD = t_r$. Beyond it the far-end reflection returns after the edge has finished and shows as a separate step. This is the usual "electrically long" boundary (for example Montrose’s $l_{max} = t_r/2t_{pd}$). It is the least conservative rule: a trace just under it still rings noticeably if left unterminated.</li>
<li><b>k = 5</b>: Bogatin’s rule that $TD$ should stay under 20 % of the rise time for the ringing on an unterminated line to stay below roughly 10 % of the swing. In FR-4 ($v \\approx 6$ in/ns) it gives his memorable "maximum unterminated length in inches ≈ rise time in ns".</li>
<li><b>k = 6</b>: Johnson and Graham’s rule that a circuit behaves as lumped when it is shorter than one sixth of the effective length of the rising edge.</li>
<li><b>k = 10</b>: a conservative margin for clocks and precision timing.</li>
</ul>
<p>The table on the Tables tab lists the critical length under each rule, so you can see how much the choice matters for your edge.</p>`,
    },
    {
      title: 'Effective permittivity',
      html: `<p>On an <b>inner layer (stripline)</b> the field is entirely in the laminate, so $\\varepsilon_{eff} = \\varepsilon_r$. On an <b>outer layer (microstrip)</b> part of the field is in the air above the trace, so the edge travels faster. The page uses the Hammerstad–Jensen static $\\varepsilon_{eff}(W/H, \\varepsilon_r, T)$, the same model as the Microstrip calculator; on FR-4 microstrip it is typically 3.0–3.5 against $\\varepsilon_r \\approx 4.3$. Solder mask on top raises it slightly (a few percent), and dispersion raises it a little at the knee frequency; both shorten $L_{crit}$ a little.</p>`,
    },
    {
      title: 'Knee frequency and bandwidth',
      html: `<p>Two common links between rise time and frequency content, for a 10–90 % rise time:</p>
$$f_{knee} = \\frac{0.5}{t_r} \\qquad\\text{and}\\qquad BW_{3dB} = \\frac{0.35}{t_r}$$
<p>The first is Johnson and Graham’s knee frequency, below which most of the energy of a digital edge lies: an interconnect that is flat up to $f_{knee}$ passes the edge essentially undistorted. The second is exact for a first-order (single-pole) low-pass: its 10–90 % step rise time is $t_r = \\ln 9 / (2\\pi f_{3dB}) = 0.3497/f_{3dB}$; Bogatin uses it as the bandwidth of a signal with that rise time. The critical-length rule is the same idea in the time domain: with $k = 5$, $L_{crit}$ is one tenth of the wavelength at $f_{knee}$, since $\\lambda_{knee} = 1/(t_{pd}\\,f_{knee}) = 2\\,l_{edge}$.</p>`,
    },
    {
      title: 'How solve-for works',
      html: `<p>All three quantities are tied by one equation, $L/L_{crit} = L\\,k\\,t_{pd}/t_r$, so the page solves it directly for the one you mark with ◎:</p>
<ul>
<li><b>L/L<sub>crit</sub></b> (analysis): is this trace, at this rise time, a transmission line? Above 1, yes.</li>
<li><b>L</b>: the critical length — the longest trace that is still lumped (or, if you set L/L<sub>crit</sub> to 0.5, half of it as a margin).</li>
<li><b>t<sub>r</sub></b>: the rise time at which a given trace becomes critical. Any faster edge needs a terminated line.</li>
</ul>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Use the <b>fastest</b> edge the driver can produce (fast corner, light load), from the IBIS model or data sheet. A slow clock with fast edges needs the same care as a fast one — the rise time, not the clock frequency, sets the critical length.</li>
<li>Beyond $L_{crit}$, route with controlled impedance and terminate: a series resistor at the driver for a point-to-point net, parallel termination at the far end for multi-drop or bidirectional nets.</li>
<li>The criterion ignores the driver impedance and the load capacitance. A strong driver into a short open line still rings; a heavily loaded line slows the edge (its loaded $t_{pd}$ is larger). Treat the result as a screening rule and simulate nets near the limit.</li>
<li>Stubs, connectors and vias have their own delays; the same rule tells you when they start to matter (a 3 mm via stub is critical for edges under roughly 100 ps).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>H. W. Johnson and M. Graham, <i>High-Speed Digital Design: A Handbook of Black Magic</i>, Prentice Hall, 1993, §1.1 (knee frequency) and §1.3 (lumped versus distributed systems, the 1/6 rule).</li>
<li>E. Bogatin, <i>Signal and Power Integrity — Simplified</i>, 2nd ed., Prentice Hall, 2009, ch. 2 (bandwidth and rise time, BW = 0.35/RT) and ch. 8 (reflections; TD &lt; 20 % of the rise time).</li>
<li>M. I. Montrose, <i>EMC and the Printed Circuit Board: Design, Theory, and Layout Made Simple</i>, IEEE Press, 1999 (“Calculating trace lengths”: electrically long traces, $l_{max} = t_r/2t_{pd}$).</li>
<li>E. Hammerstad and Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design”, IEEE MTT-S International Microwave Symposium Digest, 1980, pp. 407–409 (microstrip $\\varepsilon_{eff}$).</li>
</ol>`,
    },
  ],
};
