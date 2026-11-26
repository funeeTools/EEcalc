import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Maximum pad diameter — how this calculator works',
    lead:
      'A pad can only grow until it runs into its neighbour, or into the traces routed between the two. This page finds that ceiling from the pitch, the clearance rule and the traces in the gap, or solves the pitch, clearance or trace width for a pad you want. For a plated hole it also sets the ceiling against the IPC-2221 minimum land, so you can see at once whether the hole fits the grid at all.',
  },
  sections: [
    {
      title: 'The channel equation',
      html: `<p>Along the line joining two pad centres, half of each pad, the traces and the clearances share the pitch:</p>
$$\\frac{D}{2} + s + N(W + s) + \\frac{D}{2} = p$$
<p>so the largest pad is</p>
$$D_{max} = p - N\\,W - (N+1)\\,s$$
<ul>
<li>$p$ is the centre-to-centre distance to the nearest pad.</li>
<li>$N$ is the number of traces routed through the gap ($N = 0$ leaves only the pad-to-pad clearance).</li>
<li>$W$ is the trace width and $s$ the copper-to-copper clearance, used both between pad and trace and between traces.</li>
</ul>
<p>The same line solved for the other unknowns gives the smallest pitch $p_{min} = D + NW + (N+1)s$, the largest clearance $s_{max} = (p - D - NW)/(N+1)$ and the widest trace $W_{max} = (p - D - (N+1)s)/N$. This is the channel model the BGA breakout page uses (Intel AN 114, Xilinx UG1099); this page imports it rather than repeating it.</p>
<p>TI’s nFBGA guide shows the arithmetic on a real footprint: at 0.65 mm pitch with 0.35 mm NSMD lands, one 0.100 mm line between the lands leaves $(0.65 - 0.35 - 0.10)/2 = 0.10$ mm of clearance on each side. That case is one of the examples.</p>`,
    },
    {
      title: 'Plated holes: the floor under the ceiling',
      html: `<p>A pad with a plated hole also has a minimum size. IPC-2221B §9.1.1 sets it as</p>
$$D_{min} = a + 2b + c$$
<p>IPC-2221B defines $a$ as the maximum drilled hole. The padstack page, imported here, follows the IPC-6012 acceptance rules: it measures the external ring from the largest finished hole and the internal ring from the drill, and takes the larger land. $b$ is the minimum annular ring (50 µm external and 25 µm internal, the IPC-6012 Class 3 limits) and $c$ is the fabrication allowance of IPC-2221B Table 9-1: 0.4, 0.25 or 0.2 mm for producibility levels A, B and C. The Class 2 and Class 1 options accept 90° and 180° of breakout at the worst-case drill position, which lowers $D_{min}$. These equations come from the padstack annular-ring page, imported unchanged.</p>
<p>The useful range is $D_{min} \\le D \\le D_{max}$. When $D_{max} < D_{min}$, the hole and the routing cannot share that grid. The page then gives the largest hole the pad accepts, and the pitch $p(D_{min}) = D_{min} + NW + (N+1)s$ that would make it work.</p>
<p>With the hole centred, a pad of $D$ leaves a ring of $(D - a)/2$. At the worst-case drill position, $c/2$ off centre, it leaves $(D - a)/2 - c/2$. Both are listed for the outer layers, and the worst case for the inner layers too.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on the field you want. The pad is the default, and it is also the analysis the page falls back to after a setting change. Every unknown is solved in closed form from the same line, so a solved value fed back in reproduces the inputs exactly. If the pitch is already used up by the traces and clearances, the page reports which term leaves no room instead of returning a negative pad.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>$D_{max}$ is a ceiling, not a recommendation. A pad at the limit puts every clearance at its minimum, so etch variation alone can break the rule. Size the pad for its hole or lead first (IPC-2221, IPC-7351), then check it here.</li>
<li>The clearance $s$ is your fabricator’s rule, or the IPC-2221 Table 6-1 spacing for the voltage between the nets, whichever is larger.</li>
<li>The mask web between two openings is $p - D - 2e$; with traces in the gap, the mask must also cover them, so the web that matters is $s - e$ between an opening and the nearest trace. Below roughly 75 µm a liquid photo-imageable mask dam may not survive (a common fabricator rule of thumb, not an IPC number); a gang opening across the row is the usual alternative.</li>
<li>On a staggered or diagonal escape, the nearest neighbour may be on the diagonal, $p\\sqrt{2}$ on a square grid. Enter whichever distance the traces actually pass through.</li>
<li>The model assumes round pads and straight traces centred in the gap. Oblong pads, or traces that jog round a pad, need the real distance along the narrowest line.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-2221B, <em>Generic Standard on Printed Board Design</em>, IPC, 2012: §9.1.1 land requirements, Table 9-1 fabrication allowance, Table 9-2 minimum annular ring, Table 6-1 electrical clearance.</li>
<li>IPC-6012E, <em>Qualification and Performance Specification for Rigid Printed Boards</em>, IPC, 2020: annular ring and breakout by class.</li>
<li>Intel, <em>AN 114: Board Design Guidelines for Intel Programmable Device Packages</em>, §1.3.4.1, routing channels between lands and vias.</li>
<li>AMD Xilinx, <em>UG1099: Recommended Design Rules and Strategies for BGA Devices</em>.</li>
<li>R. Furtaw, <em>nFBGA Packaging</em>, Texas Instruments SPRAA99C, 2021: Figure 2-4 (0.65 mm pitch, 0.35 mm lands, 0.100 mm line) and Table 2-1.</li>
</ol>`,
    },
  ],
};
