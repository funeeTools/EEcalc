import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Via voltage drop — how this calculator works',
    lead:
      'A plated via is a short copper tube, and at DC its resistance is simply that of the tube. This page adds up the barrels of N identical vias in parallel, optionally the pads at each end, corrects the copper resistivity for temperature, and estimates how much the barrel heats itself. It can also work backwards from a drop limit to the via count, the current, the drill or the plating.',
  },
  sections: [
    {
      title: 'Resistance of the barrel',
      html: `<p>Plating of thickness $t$ on the wall of a hole drilled at diameter $d$ forms an annulus of area $A = \\pi t\\,(d-t)$. A copper-filled via conducts through the whole hole, $A = \\pi d^2/4$; a resin plug or an open hole adds nothing. For a via of length $h$:</p>
$$R_b = \\frac{\\rho(T)\\,h}{A},\\qquad \\rho(T) = \\rho_{20}\\,[1+\\alpha_{20}(T-20\\,^\\circ\\text{C})]$$
<p>with the IEC 60028 values for annealed copper, $\\rho_{20} = 1.724\\ \\mu\\Omega\\cdot$cm and $\\alpha_{20} = 0.00393$ /K. A standard 0.3 mm via with 25 µm plating through a 1.6 mm board has about 1.3 mΩ, about as much as 2.6 mm of a 1 mm wide, 1 oz (35 µm) trace.</p>`,
    },
    {
      title: 'Pads and parallel vias',
      html: `<p>Current reaches the barrel through a pad. If it leaves the barrel radially and the pour around the pad edge is at one potential, the pad behaves as an annular disc:</p>
$$R_{pad} = \\frac{\\rho\\,\\ln(D_{pad}/d)}{2\\pi\\,t_{pad}}$$
<p>which adds a few per cent for a typical pad. Each via has a pad at both ends, and $N$ vias in parallel share the current equally:</p>
$$R = \\frac{R_b + 2R_{pad}}{N},\\qquad V = I R,\\qquad P = I^2 R$$
<p>Equal sharing assumes the vias sit in the same pour and see the same path to the load. A row of vias fed from one side carries more current in the nearest ones, so the real drop of a long row is a little higher.</p>`,
    },
    {
      title: 'Self-heating of the barrel',
      html: `<p>Each barrel dissipates $P_{via} = (I/N)^2 R_b$ along its length. If that heat leaves only through the two pads, held at the board temperature $T_{op}$, the barrel is a rod with uniform heat generation cooled at both ends. Its temperature profile is a parabola peaking at mid-length:</p>
$$\\Delta T_{max} = \\frac{P_{via}\\,h}{8\\,k_{Cu}\\,A},\\qquad \\overline{\\Delta T} = \\tfrac23\\,\\Delta T_{max},\\qquad \\theta = \\frac{h}{k_{Cu}A}$$
<p>That is the rise with the resistivity held at $T_{op}$. With <em>self-heating</em> selected, the resistivity rises with the local temperature, $\\rho = \\rho_{op} + \\rho_{20}\\alpha\\,\\theta$, so the hotter middle heats more. The rod equation $k\\,\\theta'' + J^2(\\rho_{op} + \\rho_{20}\\alpha\\,\\theta) = 0$ with both ends at $T_{op}$ still has an exact solution. With $m^2 = J^2\\rho_{20}\\alpha/k$ and $u = mh/2$:</p>
$$R_b = R_{op}\\,\\frac{\\tan u}{u},\\qquad \\Delta T_{max} = \\frac{\\rho_{op}}{\\rho_{20}\\alpha}\\left(\\frac{1}{\\cos u}-1\\right),\\qquad \\overline{\\Delta T} = \\frac{\\rho_{op}}{\\rho_{20}\\alpha}\\left(\\frac{\\tan u}{u}-1\\right)$$
<p>For small currents this returns the figures above. As $u$ approaches $\\pi/2$ the resistance and the temperature grow without bound: above $J = (\\pi/h)\\sqrt{k/(\\rho_{20}\\alpha)}$ there is no steady state (thermal runaway), and the page says so. Long before that the barrel is far too hot for the laminate, and the page warns once its middle passes about 105 °C.</p>
<p>Conduction to isothermal pads is the best case. The IPC-2221 chart rise, which treats the barrel as an outer-layer conductor of the same cross-section, is listed beside it as a second opinion: on a via fed by a thin trace the pads warm up too, and the larger of the two figures is the safer one. Brooks and Adam found in simulations and measurements that vias run cooler than traces of equal cross-section, so the chart figure is on the safe side.</p>`,
    },
    {
      title: 'Solving for N, I, d or t',
      html: `<p>Click ◎ on any of them and the voltage drop becomes a limit. The via count is the smallest whole number whose drop is at or below the limit, so the achieved drop is shown beside it. The current, drill and plating are found by Brent’s method on the same forward equations, so a solved value fed back reproduces the limit. When every value in range already meets the limit, the page returns the cheapest end of the range (the smallest drill, the thinnest plating, the largest current) and says so. With self-heating the drop grows faster than linearly with current, and the largest current is always below the runaway current.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Plating thickness drives the result directly: IPC-6012 asks for 20 µm average (Class 1 and 2) or 25 µm (Class 3), and the thinnest point is usually in the middle of the hole.</li>
<li>Several small vias beat one large one for the same board area, because the plating area grows with the number of holes.</li>
<li>For high-current paths the trace or pour feeding the vias often drops more than the vias themselves; check it with the Trace resistance page.</li>
<li>Copper-filled vias cut the resistance by several times, but voids in the fill and the fill’s purity add uncertainty: ask the fabricator for their fill resistivity if it matters.</li>
<li>At high frequency the current crowds into the barrel surface (skin effect) and this DC result no longer applies.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IEC 60028, <em>International Standard of Resistance for Copper</em>, 1925 (annealed copper: 1/58 Ω·mm²/m at 20 °C, α = 0.00393 /K).</li>
<li>D. J. Griffiths, <em>Introduction to Electrodynamics</em>, 4th ed., Cambridge University Press, 2017, §7.1.1 (resistance with radial current).</li>
<li>F. P. Incropera, D. P. DeWitt, T. L. Bergman, A. S. Lavine, <em>Fundamentals of Heat and Mass Transfer</em>, 7th ed., Wiley, 2011, §3.1 and §3.5 (conduction with uniform heat generation).</li>
<li>IPC-2221A, <em>Generic Standard on Printed Board Design</em>, IPC, 2003, Fig. 6-4 (conductor current vs temperature rise).</li>
<li>D. Brooks, J. Adam, <em>PCB Trace and Via Currents and Temperatures: The Complete Analysis</em>, 2nd ed., 2017.</li>
<li>IPC-6012, <em>Qualification and Performance Specification for Rigid Printed Boards</em> (hole-wall plating thickness).</li>
</ol>`,
    },
  ],
};
