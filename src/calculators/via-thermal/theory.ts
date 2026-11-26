import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Thermal vias — how this calculator works',
    lead:
      'An exposed-pad package (QFN, PowerPAD, DPAK) dumps most of its heat into the pad under it. Laminate conducts heat about a thousand times worse than copper, so the heat crosses the board through an array of plated vias to copper on the far side. This page models that crossing as parallel conduction paths straight down through the board: the plating of each via, its fill, and the laminate left between the holes.',
  },
  sections: [
    {
      title: 'Conduction through one via',
      html: `<p>A slab of length $L$, area $A$ and conductivity $k$ has a thermal resistance $\\theta = L/(kA)$ (Fourier’s law). A via of drill $d$ and plating $t$ through a board of thickness $h$ offers two such paths side by side: the copper annulus of the plating and the core of the hole, which may be empty or filled:</p>
$$\\theta_b = \\frac{h}{k_{Cu}\\,\\pi t\\,(d-t)},\\qquad \\theta_f = \\frac{h}{k_{fill}\\,\\pi\\,(d/2-t)^2},\\qquad \\frac1{\\theta_{via}} = \\frac1{\\theta_b}+\\frac1{\\theta_f}$$
<p>An unfilled hole holds air ($k\\approx0.026$ W/m·K), which adds nothing. A resin plug barely helps either, at roughly 0.3–0.5 W/m·K. Solder ($k = 57.3$ W/m·K for SnAgCu) or a copper fill turns the whole hole into a conductor: at 0.3 mm a copper-filled via conducts about three times better than a plated-only one.</p>`,
    },
    {
      title: 'The array and the laminate in parallel',
      html: `<p>$N$ vias conduct in parallel. The laminate between them, the pad area minus the drilled holes, forms one more parallel path. Its copper layers lie across the heat flow, so they add in series through the thickness:</p>
$$\\theta_{lam} = \\frac{N_{Cu}t_{Cu}/k_{Cu} + (h-N_{Cu}t_{Cu})/k_{lam}}{WL - N\\pi d^2/4},\\qquad \\frac1\\theta = \\frac N{\\theta_{via}}+\\frac1{\\theta_{lam}}$$
<p>This is the model of Shen et al. (2020), summed over the via unit cells of the pad. FR-4 conducts about 0.29 W/m·K through its thickness and 0.81 W/m·K along it, so under a small pad the laminate carries only a few per cent of the heat. The temperature drop across the board is $\\Delta T = P\\,\\theta$.</p>`,
    },
    {
      title: 'What the model leaves out',
      html: `<p>The model is one-dimensional: all heat flows straight down under the pad. In a real board the inner planes and the bottom copper spread the heat sideways, which lowers the effective resistance, more so when the pad is small compared with the board thickness. The solder joint, the package’s own junction-to-case resistance and the path from the bottom copper to the air or a heatsink are separate terms in series. Use this page to compare via patterns and fills, and the total for a first estimate.</p>`,
    },
    {
      title: 'Solving for the via count or the drill',
      html: `<p>Click ◎ on $N$ and the resistance becomes a target: the page returns the smallest whole number of vias whose array reaches it, searching only up to as many as fit the pad at the chosen pitch, and shows the resistance actually achieved, which is at or a little below the target. Click ◎ on $d$ to find the drill that meets the target with the via count fixed, by Brent’s method on the same equations. The <em>Vias that fit</em> row checks the answer against the pad size and the pitch.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Many small vias beat a few large ones of the same total drilled area: the plating area grows with the number of holes, not with their size.</li>
<li>Unfilled vias in a soldered pad wick solder away from the joint and leave voids. Keep them small (0.3 mm or less), tent them from the bottom, or specify plugged and capped vias (IPC-4761 type VI/VII).</li>
<li>A pitch of about 1.0–1.2 mm under a QFN pad is a common starting point in package layout notes; tighter pitches add vias but need the fabricator’s minimum hole-to-hole spacing.</li>
<li>Plating thickness matters directly: 20 µm instead of 25 µm raises the via resistance by about a quarter.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>Y. Shen, H. Wang, F. Blaabjerg, H. Zhao, T. Long, “Thermal Modeling and Design Optimization of PCB Vias and Pads”, <em>IEEE Trans. Power Electronics</em> 35(1), 882–900, 2020, eqs. (2)–(5) and Table I.</li>
<li>F. P. Incropera, D. P. DeWitt, T. L. Bergman, A. S. Lavine, <em>Fundamentals of Heat and Mass Transfer</em>, 7th ed., Wiley, 2011, §3.1.</li>
<li>Texas Instruments, <em>PowerPAD Thermally Enhanced Package</em>, application report SLMA002.</li>
<li>Texas Instruments, <em>QFN/SON PCB Attachment</em>, application report SLUA271.</li>
<li>IPC-4761, <em>Design Guide for Protection of Printed Board Via Structures</em>, IPC, 2006.</li>
<li>IPC-6012, <em>Qualification and Performance Specification for Rigid Printed Boards</em> (hole-wall plating).</li>
</ol>`,
    },
  ],
};
