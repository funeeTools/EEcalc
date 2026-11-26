import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'BGA breakout — how this calculator works',
    lead:
      'Every ball of a BGA has to be connected to something outside the package footprint, and the only way out is through the narrow gaps between neighbouring lands (on the outer layer) or between the fan-out vias (on the inner layers). This page counts how many traces of a given width and clearance fit through one gap, how wide they may be for a required count, how large the lands or via pads may be, and roughly how many signal layers the whole array needs.',
  },
  sections: [
    {
      title: 'Traces through a channel',
      html: `<p>Two round obstacles of diameter $D$ on pitch $p$ leave a straight gap $g = p - D$ between their copper edges. $N$ traces of width $W$ need a clearance $s$ on both sides of every trace, so they fit when</p>
$$N\\,W + (N+1)\\,s \\le g \\quad\\Longrightarrow\\quad N = \\left\\lfloor \\frac{g - s}{W + s} \\right\\rfloor .$$
<p>Turned round, the widest trace for a required $N$ and the largest obstacle that still passes them are</p>
$$W_{max} = \\frac{g - (N+1)\\,s}{N}, \\qquad D_{max} = p - N\\,W - (N+1)\\,s .$$
<p>On the outer layer the obstacles are the copper lands; on the inner layers they are the via pads, which sit on the same pitch whether they are dog-bone vias (offset by half a pitch) or vias in the lands. Both channels are always reported; the <i>Channel</i> setting picks the one the solve and the drawing refer to.</p>`,
    },
    {
      title: 'Lands: NSMD or SMD',
      html: `<p>A non-solder-mask-defined (NSMD) land is a copper circle with a slightly larger mask opening around it; the joint wets the land and its side walls. A solder-mask-defined (SMD) land is a larger copper pad whose edge is covered by mask, and the opening sets the joint. For the same joint, the SMD copper is larger by twice the mask overlap (about 0.1 mm), and that copper is what the traces must clear — so SMD lands cost routing space. Switching the setting here keeps the solderable diameter and moves the copper accordingly.</p>
<p>For lead-free collapsing balls, IPC-7351B suggests lands about 20–25 % smaller than the nominal ball diameter; the land-to-ball ratio is shown for reference. The mask web left between two openings, $p - D_{mask}$, should stay above what the mask process can hold (about 75–100 µm for liquid photo-imageable mask — a rule of thumb); narrower webs flake and let solder bridge.</p>`,
    },
    {
      title: 'Fan-out and the layer count',
      html: `<p>A <b>dog-bone</b> puts the via at the centre of four balls, a distance $p/\\sqrt{2}$ from each land, with a short neck from the land. Its copper clearance to the lands is</p>
$$c = \\frac{p}{\\sqrt{2}} - \\frac{D_{land} + D_{via}}{2},$$
<p>which must be at least the clearance rule. Below about 0.65 mm pitch there is no room for a mechanically drilled via between the balls, and designs move to <b>via in pad</b>: a (micro)via inside the land, filled and plated over so solder cannot drain into it (IPC-4761 type VII).</p>
<p>On each signal layer the outermost row of balls escapes directly and each additional row needs one more trace through every channel outside it, so a layer clears $N + 1$ rows (Intel AN 114, Xilinx UG1099). With $N_{lands}$ traces between lands on the outer layer and $N_{vias}$ between vias on the inner layers, a full $n \\times n$ array, $\\lceil n/2 \\rceil$ rows deep, needs roughly</p>
$$L_{signal} \\approx 1 + \\left\\lceil \\frac{\\lceil n/2\\rceil - (N_{lands}+1)}{N_{vias}+1} \\right\\rceil$$
<p>signal layers. It is an estimate: power and ground balls drop straight to their planes and don’t need escape routes, and depopulated arrays need fewer layers.</p>`,
    },
    {
      title: 'Solving and practical notes',
      html: `<ul>
<li>With ◎ on <b>N</b> (the default) the page counts what fits. With ◎ on <b>W</b> it gives the widest trace for the $N$ you enter; on <b>D_land</b> or <b>D_via</b> the largest obstacle for $N$ traces of the entered width.</li>
<li>Diagonal escape between diagonal neighbours is not a routing channel in a full array: a 45° trace passes ball rows only $p/\\sqrt{2}$ apart, closer than the orthogonal pitch, so this page counts orthogonal channels only.</li>
<li>Traces narrower than 75–100 µm (3–4 mil) and microvias put the board into HDI processes; the trace/space table shows what each common class buys.</li>
<li>Impedance-controlled traces may need to neck down inside the footprint and widen again outside it; keep the neck short.</li>
<li>Etch compensation and registration eat into the channel: use the fabricator’s finished minimums for $W$ and $s$.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>IPC-7351B, <i>Generic Requirements for Surface Mount Design and Land Pattern Standard</i>, IPC, 2010 (BGA land sizing for collapsing balls).</li>
<li>Intel, AN 114, <i>Board Design Guidelines for Intel Programmable Device Packages</i>, 2019, §1.3.4 (escape routing, rows per layer).</li>
<li>AMD Xilinx, UG1099, <i>Recommended Design Rules and Strategies for BGA Devices</i> (fan-out, via-in-pad, layer count).</li>
<li>IPC-4761, <i>Design Guide for Protection of Printed Board Via Structures</i>, 2006 (type VII filled and capped vias).</li>
</ol>`,
    },
  ],
};
