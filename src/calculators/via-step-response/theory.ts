import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Via step response — how this calculator works',
    lead:
      'A via that is short compared with the edge passing through it behaves as a small lumped circuit: its pads and barrel add capacitance to the planes, and its barrel adds series inductance. This page estimates both with Johnson & Graham’s formulas, places them in a π or T network between matched lines, and computes exactly how a step comes through and what a TDR would see. It can also work out the fastest edge, or the smallest antipad, that keeps the slowdown within a budget.',
  },
  sections: [
    {
      title: 'Capacitance and inductance of the via',
      html: `<p>Johnson and Graham estimate the capacitance of a via’s pads to the surrounding planes as a parallel-plate gap repeated through the board. In inches and picofarads, with $T$ the board thickness, $D_1$ the pad and $D_2$ the antipad (clearance) diameter:</p>
$$C \\approx \\frac{1.41\\,\\varepsilon_r\\,T\\,D_1}{D_2-D_1}\\ \\text{pF}$$
<p>and the inductance of a barrel of length $h$ and diameter $d$:</p>
$$L \\approx 5.08\\,h\\left[\\ln\\frac{4h}{d}+1\\right]\\ \\text{nH}$$
<p>Their worked example, a 0.063 in board with 0.028 in pads, 0.055 in clearances and $\\varepsilon_r = 4.4$, gives 0.41 pF; a 0.016 in drill gives about 1.2 nH. The textbook partial self-inductance of a straight wire (Rosa, Grover) has $-1$ in place of $+1$ and comes out about half as large for a typical via. Which is closer depends on where the return current flows, which these formulas do not know, so both are offered.</p>`,
    },
    {
      title: 'Rise-time degradation',
      html: `<p>Seen from the via, the source half and the load half of the line are two $Z_0$ resistances. A shunt capacitance sees them in parallel, $Z_0/2$; a series inductance sees them in series, $2Z_0$. Each alone is a single pole whose 10–90 % time is $\\ln 9 \\approx 2.2$ time constants:</p>
$$t_C = 2.2\\,C\\,\\frac{Z_0}{2},\\qquad t_L = 2.2\\,\\frac{L}{2Z_0},\\qquad t_{r,out} \\approx \\sqrt{t_r^2+t_C^2+t_L^2}$$
<p>Rise times of cascaded stages add roughly in quadrature, which gives the last expression. It is pessimistic when both are present: inductance and capacitance partly cancel, and a via with $\\sqrt{L/C} = Z_0$ looks like a short piece of matched line. The <em>net-excess</em> estimate uses only the difference of the two time constants, $|C Z_0/2 - L/(2Z_0)|$.</p>`,
    },
    {
      title: 'The simulated step and the TDR',
      html: `<p>To see what really comes out, the page drives the chosen network (π: $C/2$, $L$, $C/2$; T: $L/2$, $C$, $L/2$; or the capacitance or inductance alone) from a $Z_0$ source with a linear ramp of 10–90 % time $t_r$, into a $Z_0$ load. The circuit is linear, so it is written as a state-space system and stepped with the exact matrix exponential; because the ramp is piecewise linear, every sample is exact. The transmitted edge gives $t_{r,out}$, the added delay and any overshoot. The reflected wave $\\rho(t) = v_1(t) - u(t)$ is what a TDR would show at the via, drawn as the impedance $Z_0(1+\\rho)/(1-\\rho)$.</p>
<p>A capacitive via shows a dip, an inductive one a bump; a π network shows both. The area under the reflection is fixed by the elements alone, whatever the edge:</p>
$$\\int_0^\\infty \\rho(t)\\,dt = \\frac{L}{2Z_0} - \\frac{C Z_0}{2}$$
<p>which is how excess capacitance and inductance are read off a measured TDR trace. A faster edge makes the dip deeper but not wider.</p>`,
    },
    {
      title: 'Solving for the edge or the antipad',
      html: `<p>Click ◎ on $t_r$ to find the fastest edge whose slowdown, $(t_{r,out}-t_r)/t_r$, stays within the budget: the page scans from slow to fast edges and refines the first crossing with Brent’s method on the simulated slowdown. Click ◎ on $D_{ap}$ to find the smallest antipad that meets the budget at the given edge: opening the antipad lowers $C$, so the slowdown falls until the barrel inductance takes over. The <em>antipad for $Z_{via} = Z_0$</em> row gives the closed-form balance point $C = L/Z_0^2$.</p>`,
    },
    {
      title: 'Validity and practical notes',
      html: `<ul>
<li>The lumped model holds while the via’s own delay $h\\sqrt{\\varepsilon_r}/c$ is well under the rise time; the page warns above one sixth of it. Faster than that, model the barrel as a short transmission line or use a 3-D field solver.</li>
<li>Johnson and Graham call their formulas rough estimates. They ignore the non-functional pads on inner layers, the number of planes, stubs and nearby ground vias, which can all matter as much as the antipad.</li>
<li>Remove non-functional pads, size antipads generously, and back-drill long stubs; place a ground via next to each signal via that changes reference planes.</li>
<li>A slowdown below zero means the via’s slight overshoot steepened the 10–90 % section: the edge is effectively unchanged.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>H. Johnson, M. Graham, <em>High-Speed Digital Design: A Handbook of Black Magic</em>, Prentice Hall, 1993, §7.3 (capacitance of vias) and §7.4 (inductance of vias).</li>
<li>E. B. Rosa, “The self and mutual inductances of linear conductors”, <em>Bulletin of the Bureau of Standards</em> 4(2), 1908, p. 301; F. W. Grover, <em>Inductance Calculations</em>, Van Nostrand, 1946.</li>
<li>Agilent Technologies, <em>Time Domain Reflectometry Theory</em>, application note 1304-2, 2006 (excess capacitance and inductance from the integrated reflection).</li>
<li>H. Johnson, <em>High-Speed Signal Propagation: Advanced Black Magic</em>, Prentice Hall, 2003, ch. 5 (vias).</li>
<li>C. Moler, C. Van Loan, “Nineteen dubious ways to compute the exponential of a matrix, twenty-five years later”, <em>SIAM Review</em> 45(1), 2003 (scaling and squaring).</li>
</ol>`,
    },
  ],
};
