import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'BGA land pads — how this calculator works',
    lead:
      'A BGA land is sized from the ball, not from the pitch. IPC-7351B makes the land a fixed percentage smaller than a collapsing ball, or larger than a non-collapsing one, with the percentage set by the ball size. This page applies that rule (or the IPC-7352 density levels, or the package pad), adds the solder-mask opening for NSMD or SMD lands, and checks what the land leaves between neighbours for mask and routing.',
  },
  sections: [
    {
      title: 'The land from the ball',
      html: `<p>For a nominal ball diameter $D_{ball}$ the land is</p>
$$D_{land} = D_{ball}\\,(1 - r) \\quad\\text{collapsing balls},\\qquad D_{land} = D_{ball}\\,(1 + r) \\quad\\text{non-collapsing balls}$$
<p>IPC-7351B Table 14-5 (collapsing balls: SAC and SnPb, which melt and slump onto the land) and Table 14-6 (non-collapsing: high-melt or copper-core balls) set $r$ by ball size:</p>
<table class="theory-table">
<tr><th>Nominal ball</th><th>Collapsing, Table 14-5</th><th>Non-collapsing, Table 14-6</th></tr>
<tr><td>0.55–0.75 mm</td><td>25 % smaller</td><td>15 % larger</td></tr>
<tr><td>0.25–0.50 mm</td><td>20 % smaller</td><td>10 % larger</td></tr>
<tr><td>0.15–0.20 mm</td><td>15 % smaller</td><td>5 % larger</td></tr>
</table>
<p>Each row of the tables lists the nominal land, rounded to the 0.05 mm grid for most balls, and a land variation: the range a land may take for that ball. For a 0.45 mm ball the nominal is 0.35 mm, and 0.30–0.40 mm is acceptable. This page reports the unrounded land $D_{ball}(1-r)$ (0.36 mm here) together with the tabulated nominal and range, and judges the land against that range.</p>
<p>One row is corrected. Table 14-6 prints the variation for 0.45 mm non-collapsing balls as 0.55–0.40 mm, a 0.15 mm spread where every other row of that table spans 0.10 mm (0.06 mm for the smallest balls). This page uses 0.55–0.45 mm. The two uneven rows of Table 14-5 (0.30 mm balls: 0.25–0.20 mm; 0.25 mm balls: 0.20–0.17 mm) are kept as printed, because they still contain their nominal and nothing marks them as misprints. The tabulated nominals are ball × (1 − r) rounded to the 0.05 mm grid (0.01 mm for the small balls), with one exception: the 0.17 mm collapsing row lists 0.15 mm where 0.1445 mm would round to 0.14.</p>
<p>A ball between two rows takes the row of the next smaller ball. This is the usual reading of the table, and it means the smaller reduction across a band edge. Balls outside 0.15–0.75 mm, such as the 0.76 mm balls of many 1.27 mm PBGAs, use the nearest band extended, and the page warns. For those, the package vendor’s land is the better reference.</p>`,
    },
    {
      title: 'Other sizing rules',
      html: `<ul>
<li><strong>IPC-7352 density levels.</strong> IPC-7352 (2023) replaced the bands with one percentage per density level: collapsing balls 15, 20 or 25 % smaller at levels A, B and C, and non-collapsing balls 15, 10 or 5 % larger. The IPC-7351B range is still shown, for comparison only: under these levels (and under the package-pad rule) a land outside it is not flagged as a failure.</li>
<li><strong>Package pad.</strong> TI’s nFBGA guide (SPRAA99C §2.1) argues from strain, not from the ball. A board land equal to the pad on the package substrate loads both ends of the joint equally, and it gives the longest fatigue life. For NSMD lands TI quotes about 90 % of the package pad (Table 3-4), and this rule applies that: the NSMD land is 0.9 times the package pad, the SMD opening equals it. Choose this rule when the package drawing gives that pad.</li>
<li><strong>Custom.</strong> Click the percentage to type your own, for example from a vendor’s land recommendation.</li>
</ul>
<p>TI’s Table 2-1 lists optimum NSMD lands by pitch: 0.225, 0.30, 0.35, 0.40 and 0.45 mm for 0.4, 0.5, 0.65, 0.8 and 1.0 mm pitch, each with a mask opening 0.075–0.10 mm larger. At 1.0 mm pitch with 0.6 mm balls, IPC-7351B (25 % smaller) gives the same 0.45 mm. The page lists TI’s land when the pitch matches one of its rows.</p>`,
    },
    {
      title: 'NSMD and SMD lands',
      html: `<p>A <em>non-solder-mask-defined</em> (NSMD) land is copper etched to size, with the mask opening clearing it by a margin, typically 0.05 mm per side. Solder wets the top and the sides of the copper. A <em>solder-mask-defined</em> (SMD) land is a larger copper pad whose mask opening sets the solderable diameter.</p>
<ul>
<li>NSMD is the usual choice for collapsing balls: IPC-7095, TI AN-1112 and Intel AN 114 all prefer it. The copper is smaller, which leaves more room to route between lands, and there is no mask edge biting into the joint, where cracks start under thermal cycling.</li>
<li>SMD holds the copper down better, which helps in drop and bend tests. It is also common with non-collapsing balls and at very fine pitch. Its cost is the larger copper, which narrows the routing channel by twice the mask overlap.</li>
</ul>
<p>On this page the land is always the solderable diameter: the copper for NSMD, the opening for SMD. The mask clearance then gives the other diameter: the NSMD opening is $D_{land} + 2c$, and the SMD copper is $D_{land} + 2c$.</p>`,
    },
    {
      title: 'Pitch checks',
      html: `<p>With copper diameter $D_{cu}$ on pitch $p$, the copper gap between lands is $g = p - D_{cu}$. That gap must hold $N$ traces of width $W$ at clearance $s$:</p>
$$N_{fit} = \\left\\lfloor \\frac{g - s}{W + s} \\right\\rfloor, \\qquad p_{min} = D_{cu} + NW + (N+1)s$$
<p>This is the channel model of the BGA breakout page (Intel AN 114), imported from there. The mask web between neighbouring openings is $p - D_{mask}$. Below about 75 µm, a liquid photo-imageable mask may not hold; that figure is a common fabricator rule of thumb, not an IPC value. The Tables tab runs every row of the IPC table at your pitch and trace rules.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>By default the land is solved from the ball and the rule, and the percentage the rule applies is shown beside it. Click ◎ on the land to type a land you already have, for example from an old library footprint. The page then shows what percentage of the ball that land represents, and whether it falls inside the IPC-7351B range. Clicking the computed percentage turns it into a custom input at the same value.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Use the nominal ball diameter from the package drawing, not the maximum. JEDEC JEP95 allows a spread of roughly ±0.05 mm for the common sizes.</li>
<li>The package vendor’s recommended land, where one exists, overrides the generic table.</li>
<li>Older libraries built to a density-level rule often have lands larger than the IPC-7351B range, such as 0.55 mm under 0.6 mm balls. These lower the stand-off and narrow the routing channel.</li>
<li>Traces leaving an NSMD land should stay narrower than about two thirds of the land diameter until the mask covers them (TI AN-1112); see the conductor-to-pad-width page.</li>
<li>Stencil apertures, via-in-pad and the full escape plan are covered on the solder-paste, padstack and BGA breakout pages.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-7351B, <em>Generic Requirements for Surface Mount Design and Land Pattern Standard</em>, IPC, June 2010: §14, Table 14-5 “Land Approximation (mm) for Collapsible Solder Balls” and Table 14-6 “Land Approximation (mm) for Non-Collapsible Solder Balls”. Row values as transcribed in Altium, “What’s Your BGA Land Pattern and Footprint?”.</li>
<li>IPC-7352, <em>Generic Guideline for Land Pattern Design</em>, IPC, 2023 (density-level percentages, as summarised in the Altium article above).</li>
<li>R. Furtaw, <em>nFBGA Packaging</em>, Texas Instruments SPRAA99C, 2021: §2.1, Figure 2-1 (land equal to the package pad), Table 2-1 (optimum lands by pitch), Table 3-4.</li>
<li>Texas Instruments, <em>AN-1112 DSBGA Wafer Level Chip Scale Package</em>, SNVA009AI, 2019: §4.1 (NSMD preferred; trace at most 2/3 of the land).</li>
<li>Intel, <em>AN 114: Board Design Guidelines for Intel Programmable Device Packages</em> (NSMD and SMD lands, routing channels).</li>
<li>IPC-7095D, <em>Design and Assembly Process Guidance for BGAs</em>, IPC (NSMD versus SMD lands).</li>
<li>JEDEC JEP95, <em>JEDEC Registered and Standard Outlines for Solid State and Related Products</em> (ball diameters).</li>
</ol>`,
    },
  ],
};
