import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Microvia current capacity — how this calculator works',
    lead:
      'No IPC chart rates vias, let alone laser microvias. This page combines a widely used convention, the IPC-2221 conductor fit applied to the plated barrel, with the physics that actually sets the limits: the resistance and self-heating of the barrel, the current density in thin plating, and the temperature of the trace that feeds the via, which is usually what runs hot first.',
  },
  sections: [
    {
      title: 'The guardrail: plated area on the IPC-2221 fit',
      html: `<p>The plating of a laser microvia of diameter $D$ (at its narrow, target end) and wall thickness $t$ is a ring of area $A = \\pi t\\,(D-t)$; a copper-filled via conducts through $A = \\pi D^2/4$. Treated as a conductor of that area on the IPC-2221A curve fit,</p>
$$I = k\\,\\Delta T^{0.44}\\,A^{0.725}\\qquad (A\\ \\text{in mil}^2,\\ k = 0.024\\ \\text{internal},\\ 0.048\\ \\text{external})$$
<p>$N$ vias are rated by their combined area, so the capacity grows as $N^{0.725}$, not $N$. This is a convention, not a temperature prediction: the chart was measured on long traces, while a microvia is a few tens of micrometres long and its pads cool it. Read it as a limit on how much current the thin plating should carry, and compare both curves.</p>`,
    },
    {
      title: 'What the barrel itself does',
      html: `<p>The barrel’s DC resistance is $R = \\rho(T)\\,h/A$ per via ($\\rho_{20} = 1.724\\ \\mu\\Omega\\cdot$cm, $+0.393\\ \\%$/K). With its heat leaving only through the two pads, a rod with uniform heating peaks at mid-length:</p>
$$\\Delta T_b = \\frac{P_{via}\\,\\theta}{8},\\qquad \\theta = \\frac{h}{k_{Cu}A}$$
<p>For a 75 µm deep microvia this is a tiny fraction of a degree: the barrel is too short to heat itself. What matters is the current density $J = I/(NA)$. Around 100 A/mm² is a common rule of thumb for plated copper at DC (not an IPC limit): above it, thin spots in the plating, voids and electromigration become a reliability risk.</p>`,
    },
    {
      title: 'The feeding trace',
      html: `<p>The current reaches the via through a trace, often a narrow one on an HDI layer. The page rates that trace on the same IPC-2221 fit used by the Trace width page and shows which limits first at the allowed rise: the microvia guardrail or the trace. On most HDI boards it is the trace.</p>
<p>IPC-2152 (2009) superseded the IPC-2221 conductor charts with new measurements. As summarised by Brooks and Adam, it shows that internal traces run about as cool as external ones, so the IPC-2221 internal curve used here is conservative, and that nearby planes and board thickness lower the rise further. Its charts are not reproduced on this page; for a tight design, read the trace rise from IPC-2152 for your stack-up.</p>`,
    },
    {
      title: 'Microvia geometry (IPC-T-50, IPC-2226, IPC-6012)',
      html: `<ul>
<li><strong>Definition.</strong> Since the 2013 revision of IPC-T-50 a microvia is a blind structure with an aspect ratio (depth : diameter) of at most 1:1 and a depth of at most 0.25 mm from the capture land to the target land. The older definition was a hole of 0.15 mm or less.</li>
<li><strong>Aspect ratio.</strong> At most 1:1; most fabricators prefer 0.75:1 or less so the plating reaches the bottom.</li>
<li><strong>Plating.</strong> IPC-6012 specifies blind/buried microvia plating separately from through holes; fabricators’ reproductions of the table give 12 µm average and 10 µm minimum for Class 2. Check Class 3 in your copy of the standard. Design with the minimum.</li>
<li>Stacked microvias are usually copper filled; staggered ones are often conformal. Each microvia in a stack carries the full current, so rate the narrowest one.</li>
</ul>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on $N$ for the smallest whole number of microvias whose guardrail capacity covers the design current, on $D$ for the smallest diameter (closed form from the area the fit needs), or on $\\Delta T$ for the guardrail rise at the design current.</p>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-2221A, <em>Generic Standard on Printed Board Design</em>, IPC, 2003, §6.2 and Fig. 6-4.</li>
<li>IPC-2226, <em>Sectional Design Standard for High Density Interconnect (HDI) Printed Boards</em>, IPC.</li>
<li>IPC-T-50, <em>Terms and Definitions for Interconnecting and Packaging Electronic Circuits</em>, IPC, 2013 revision and later (microvia definition).</li>
<li>IPC-6012, <em>Qualification and Performance Specification for Rigid Printed Boards</em> (microvia plating table).</li>
<li>IPC-2152, <em>Standard for Determining Current Carrying Capacity in Printed Board Design</em>, IPC, 2009.</li>
<li>D. Brooks, J. Adam, <em>PCB Trace and Via Currents and Temperatures: The Complete Analysis</em>, 2nd ed., 2017.</li>
<li>F. P. Incropera et al., <em>Fundamentals of Heat and Mass Transfer</em>, 7th ed., Wiley, 2011, §3.5.</li>
<li>IEC 60028, <em>International Standard of Resistance for Copper</em>.</li>
</ol>`,
    },
  ],
};
