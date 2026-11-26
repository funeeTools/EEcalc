import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Conductor-to-pad width — how this calculator works',
    lead:
      'A trace that joins a surface-mount land is part of the solder joint’s surroundings. If it is too wide, it takes solder from the joint and pulls the part off centre; if the two lands of a small part are connected unequally, they melt at different times and the part can stand on end. This page checks a trace against the published width guideline, sizes the widest trace or the smallest land, and works out the neck-down, the exposed copper and the thermal balance of the two lands.',
  },
  sections: [
    {
      title: 'What the rule is, and where it comes from',
      html: `<p>There is no physical law for this, only a design guideline. The number in use comes from TI’s application note on wafer-level packages (AN-1112, §4.1): for a non-solder-mask-defined (NSMD) land, <em>the trace width where it joins the land should not exceed two thirds of the land diameter</em>. TI repeats the same limit in power-device datasheets for rectangular lands, measured across the land edge the trace joins, and asks that it hold for as long as the trace is not covered by mask. Microchip’s WLCSP guide gives an absolute figure for the same situation: under 100 µm, preferably 75 µm, of trace inside the opening.</p>
<p>We could not find a numeric conductor-to-land ratio in IPC-7351B or IPC-2221B. They size the land and the conductor, but not the ratio between them. So this page treats the limit as a stated guideline, defaults it to TI’s 2/3, and lets you enter your assembler’s own figure.</p>
$$\\frac{W}{D} \\le k, \\qquad k = \\tfrac{2}{3}\\ \\text{(TI AN-1112)}$$
<p>$W$ is the trace width at the land and $D$ the width of the land edge it joins (the diameter of a round land).</p>`,
    },
    {
      title: 'Why width matters: exposed copper',
      html: `<p>An NSMD opening clears the land by $e$ on every side, so the first $e$ of the trace is bare copper inside the opening. Solder wets it like the land, so the trace adds to the area the solder spreads over. The joint gets lower on that side, and the wetting force pulls the part towards the trace. Suntron’s 0402 tombstoning study (2011) makes the same argument for a land that sits in a mask-defined plane.</p>
<p>For a trace on the centre line, entering perpendicular to the land edge, the exposed area is exact plane geometry:</p>
$$A_{exp} = \\min(W,\\ D + 2e)\\cdot e \\qquad \\text{(rectangular land)}$$
$$A_{exp} = 2\\left[F\\!\\left(\\tfrac{W}{2},\\ R+e\\right) - F\\!\\left(\\tfrac{W}{2},\\ R\\right)\\right],\\quad F(a,\\rho) = \\tfrac12\\left[m\\sqrt{\\rho^2-m^2} + \\rho^2\\arcsin\\tfrac{m}{\\rho}\\right],\\ m = \\min(a,\\rho) \\qquad \\text{(round land, } R = D/2)$$
<p>The page reports it as a percentage of the land area, for the trace as routed and for the trace if it ran in at full routing width. A solder-mask-defined (SMD) land covers the trace, so nothing is exposed. The 2/3 guideline is written for NSMD lands, and the page does not apply it to SMD.</p>`,
    },
    {
      title: 'Neck-down',
      html: `<p>When the trace must be wider than $kD$ for current or impedance, it is narrowed (necked down) just before the land. The narrow part must reach from the land edge to under the mask edge, even with the mask shifted by its registration tolerance $\\delta_{reg}$:</p>
$$L_{neck} \\ge e + \\delta_{reg}$$
<p>This is the geometric minimum worked out on this page, not a figure from a standard; some assemblers ask for a longer run (a few tenths of a millimetre) at equal width on both lands. A longer neck does no harm to the joint. Check that it carries the current over its short length; the trace-width calculator handles that.</p>`,
    },
    {
      title: 'Thermal balance (two-terminal parts)',
      html: `<p>In reflow a small chip part sits on two lands. If one land is tied to more copper, it heats more slowly, the other land’s solder melts first, and its surface tension can stand the part upright (tombstoning). For equal copper thickness and length, a strip’s thermal conductance is proportional to its width. The page therefore compares the copper width leaving each land: the trace, the total width of thermal-relief spokes, or the whole land perimeter when the land sits directly in a pour.</p>
$$\\text{imbalance} = \\frac{\\max(W_a, W_b)}{\\min(W_a, W_b)}$$
<p>This is an indicator, not a reflow model: planes on inner layers, vias and nearby parts also sink heat. Suntron recommends equal connections. The page flags ratios over 1.5 : 1, which follows a fabricator rule of thumb (traces within 50 % of each other near the lands); no standard sets a tolerance.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on $W$ for the widest trace the limit allows at this land, or on $D$ for the smallest land that takes this trace. The ratio box then holds the target; it starts at the limit, but you can ask for less, such as 50 % for margin. The ratio itself is the check: it shows $W/D$ for the trace as entered, and the status says whether it meets the limit.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Keep the connections to both lands of 0402 and smaller parts symmetric: the same width, the same direction and the same mask opening.</li>
<li>Join a land to a pour through thermal-relief spokes, and match their total width to the trace on the other land.</li>
<li>Through-hole lands are a different case. There the concern is the junction surviving drill breakout, and teardrops (fillets) at the land–conductor junction are the usual fix; see the padstack page.</li>
<li>BGA and CSP lands: route out symmetrically in X and Y as well (TI AN-1112), so the wetting forces do not rotate the part.</li>
<li>Copper thicker than 1 oz on fine-pitch lands lowers the stand-off (TI AN-1112).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>Texas Instruments, <em>AN-1112 DSBGA Wafer Level Chip Scale Package</em>, SNVA009AI, rev. December 2019, §4.1 (NSMD preferred; trace at most 2/3 of the land diameter; symmetric fan-out).</li>
<li>Texas Instruments, <em>LMG3522R050 / LMG3526R050</em> datasheet, SLUSEY6A, 2024, layout guidelines (2/3 of the land width, kept until the mask covers the trace).</li>
<li>Microchip, <em>Surface-Mount Technology (SMT) Guidelines and PCB Best Practices</em> (WLCSP), §6, Table 6-1 (75 µm nominal trace, under 100 µm in the exposed area).</li>
<li>E. Reno, <em>The Low Mass Solution to 0402 Tombstoning</em>, Suntron engineering white paper, July 2011 (exposed copper and copper density as tombstoning causes; balanced connections).</li>
<li>IPC-7351B, <em>Generic Requirements for Surface Mount Design and Land Pattern Standard</em>, IPC, 2010 (land patterns; we located no numeric conductor-to-land ratio in it).</li>
<li>AtlasPCB engineering blog, “PCB tombstoning prevention”, 2026 (rule of thumb: widths within 50 % near the lands).</li>
</ol>`,
    },
  ],
};
