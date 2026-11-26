import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Plated through vias — how this calculator works',
    lead:
      'A through via is a drilled hole whose wall is electroplated with copper, joining pads on every layer it passes. Almost everything about it follows from that thin copper tube: its cross-section sets the resistance, the current it can carry and how well it conducts heat, while its diameter against the plane clearance sets its impedance, capacitance and inductance. This page computes all of them from one set of dimensions and checks the hole against the fabricator’s aspect-ratio limit.',
  },
  sections: [
    {
      title: 'The plated barrel',
      html: `<p>The drill of diameter $d$ is plated to a thickness $t$, leaving a finished hole $d-2t$. The copper is an annulus between radii $d/2-t$ and $d/2$:</p>
$$A = \\pi\\left[\\left(\\tfrac d2\\right)^2-\\left(\\tfrac d2-t\\right)^2\\right] = \\pi\\,t\\,(d-t)$$
<p>Along a barrel of length $T$ (the board thickness for a through via):</p>
$$R = \\frac{\\rho(T_c)\\,T}{A},\\qquad \\rho(T_c)=\\rho_{20}\\,[1+\\alpha_{20}(T_c-20\\,^{\\circ}\\mathrm C)],\\qquad \\theta = \\frac{T}{k_{Cu}\\,A}$$
<p>with annealed copper $\\rho_{20} = 1.724\\ \\mu\\Omega\\,\\mathrm{cm}$ and $\\alpha_{20}=0.00393$ /K, evaluated at the conductor temperature $T_c = T_a+\\Delta T$. The thermal resistance $\\theta$ counts only the plating; a filled via, or several vias under a hot pad, are handled by the Thermal Via calculator.</p>`,
    },
    {
      title: 'Current capacity',
      html: `<p>IPC-2221 gives a curve fit to its conductor charts for the current that heats a conductor of cross-section $A$ by $\\Delta T$:</p>
$$I = k\\,\\Delta T^{0.44}\\,A^{0.725}\\qquad (A\\ \\text{in mil}^2,\\ \\Delta T\\ \\text{in °C},\\ I\\ \\text{in A})$$
<p>with $k = 0.048$ for external and $0.024$ for internal conductors. There is no separate curve for vias; the usual practice, followed here, is to rate the plating as a conductor of the same area. Brooks and Adam showed by simulation and measurement that a via actually runs cooler than a trace of equal area, because it is short and the copper at both ends draws its heat away, so the chart value is on the safe side. The charts span 10–100 °C and up to 35 A (external); the page warns outside that range.</p>`,
    },
    {
      title: 'Impedance, capacitance and inductance',
      html: `<p>Seen by a fast edge, the barrel inside its plane clearances behaves like the centre conductor of a short coaxial line whose outer conductor is the antipad edge of diameter $D_{ap}$:</p>
$$Z_{via} = \\frac{\\eta_0}{2\\pi\\sqrt{\\varepsilon_r}}\\ln\\frac{D_{ap}}{d}\\approx\\frac{59.96\\ \\Omega}{\\sqrt{\\varepsilon_r}}\\ln\\frac{D_{ap}}{d}$$
<p>This is good with planes on most layers and optimistic with only two. Johnson and Graham give lumped estimates, in inches and picofarads / nanohenries:</p>
$$C \\approx \\frac{1.41\\,\\varepsilon_r\\,T\\,D_{pad}}{D_{ap}-D_{pad}}\\ \\mathrm{pF},\\qquad L \\approx 5.08\\,T\\left[\\ln\\frac{4T}{d}+1\\right]\\ \\mathrm{nH}$$
<p>The capacitance assumes the pad faces a plane across the clearance, so it needs $D_{ap} > D_{pad}$. The inductance is shown first as the Rosa/Grover partial self-inductance of a straight round conductor, $\\frac{\\mu_0 T}{2\\pi}\\left[\\ln\\frac{4T}{d}-1\\right]$, which the book form overstates by $2\\cdot 5.08\\,T$ nH; both need a via much longer than its diameter. The delay through the barrel is $T\\sqrt{\\varepsilon_r}/c$.</p>`,
    },
    {
      title: 'Aspect ratio',
      html: `<p>The aspect ratio $T/d$ compares the board thickness with the drill. Plating solution has to flow through the hole, so a deep, narrow hole plates thinner in the middle than at the ends. Typical capabilities are about 8:1 for standard production and 10–12:1 for advanced shops; the presets are only a guide, so ask your fabricator. The smallest drill the limit allows is $T/\\mathrm{AR}_{max}$.</p>`,
    },
    {
      title: 'Solving for the drill, the plating or the antipad',
      html: `<p>Click ◎ beside the drill $d$ or the plating $t$ and the current box becomes a target: the page finds the size whose barrel carries that current at the chosen $\\Delta T$. Click ◎ beside $D_{ap}$ and the impedance becomes a target for the antipad. Each unknown is found by Brent’s method on the same forward equations, so feeding the answer back reproduces the target. Current and impedance are independent, so one is always computed while the other is the target.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>IPC-6012 asks for at least 20 µm average hole-wall copper for Class 1 and 2 boards and 25 µm for Class 3. Thin plating is the usual reason a via cracks under thermal cycling.</li>
<li>For high currents several vias in parallel beat one large via: they share the current, and each stays within the aspect-ratio and pad limits.</li>
<li>The impedance estimate ignores the pads and non-functional pads, which add capacitance and pull the real value down. Confirm a critical RF or multi-gigabit transition with a 3-D solver.</li>
<li>Tenting the via with mask keeps solder from wicking into it; it does not change any result on this page.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-2221A, <em>Generic Standard on Printed Board Design</em>, IPC, 2003, §6.2 and Fig. 6-4 (conductor current charts).</li>
<li>IPC-6012D, <em>Qualification and Performance Specification for Rigid Printed Boards</em>, IPC, 2015, Table 3-2 (plating thickness).</li>
<li>D. Brooks, J. Adam, <em>PCB Trace and Via Currents and Temperatures: The Complete Analysis</em>, 2nd ed., 2017.</li>
<li>H. Johnson, M. Graham, <em>High-Speed Digital Design: A Handbook of Black Magic</em>, Prentice Hall, 1993, ch. 7.</li>
<li>F. W. Grover, <em>Inductance Calculations</em>, Van Nostrand, 1946; E. B. Rosa, “The self and mutual inductances of linear conductors”, Bull. Bureau of Standards 4(2), 1908.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, Table 2.1 (coaxial line).</li>
<li>Y. Shen, H. Wang, F. Blaabjerg, H. Zhao, T. Long, “Thermal Modeling and Design Optimization of PCB Vias and Pads”, <em>IEEE Trans. Power Electronics</em> 35(1), 882–900, 2020.</li>
<li>IEC 60028, <em>International standard of resistance for copper</em>.</li>
</ol>`,
    },
  ],
};
