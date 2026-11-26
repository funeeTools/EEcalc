import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Solder paste and stencil apertures — how this calculator works',
    lead:
      'A stencil print fills each aperture with paste and then pulls the foil away; the paste must stick to the pad more than to the aperture walls. IPC-7525 turns that into two geometric checks, the area ratio and the aspect ratio. This page computes both for a rectangular or round aperture, the paste volume deposited, and the solder volume left after the flux has gone during reflow. It solves for the foil thickness or the aperture reduction that gives a target paste volume.',
  },
  sections: [
    {
      title: 'Area ratio and aspect ratio',
      html: `<p>When the stencil separates, the paste brick touches the pad over the opening area $A$ and the aperture walls over the area $P\\,T$ (perimeter times foil thickness). IPC-7525B §3.2.1 uses the ratio of the two as its main release guideline:</p>
$$AR = \\frac{A}{P\\,T} > 0.66$$
<p>For a rectangle $L\\times W$ this is $LW/\\big(2(L+W)T\\big)$; for a circle of diameter $D$ it is $D/(4T)$. Rounded corners of radius $r$ use the true area and perimeter, $A = LW-(4-\\pi)r^2$ and $P = 2(L+W)-(8-2\\pi)r$. For long, narrow openings the aspect ratio is checked as well:</p>
$$\\text{aspect} = \\frac{W_{min}}{T} > 1.5$$
<p>For a long slot ($L \\gg W$) the area ratio tends to $W/(2T)$, half the aspect ratio, so the two limits agree at about $W/T = 1.33$–$1.5$. The page reports the thickest foil each rule allows, $T_{max} = A/(0.66P)$ and $W_{min}/1.5$.</p>`,
    },
    {
      title: 'Paste volume and solder volume',
      html: `<p>The paste deposited is the aperture volume times the transfer efficiency measured by solder-paste inspection:</p>
$$V_{paste} = A\\,T\\,TE$$
<p>Paste is metal powder in a flux vehicle. Data sheets give the metal content $w_m$ as a weight fraction (typically 85–90 %), but the metal is seven to eight times denser than the flux, so by volume the paste is only about half metal. By the rule of mixtures,</p>
$$\\varphi_m = \\frac{w_m/\\rho_m}{w_m/\\rho_m + (1-w_m)/\\rho_f}$$
$$V_{solder} = \\varphi_m V_{paste}$$
<p>For SAC305 at 88.5 wt % ($\\rho_m = 7.40$ g/cm³) with a flux vehicle of 1.0 g/cm³, $\\varphi_m = 51.0$ %: half of the printed volume disappears in reflow. That matches the industry rule of thumb that a paste of about 90 % metal by weight is about 50 % metal by volume.</p>`,
    },
    {
      title: 'Solving for T or the reduction',
      html: `<p>Paste volume is linear in $T$, so the thickness for a target volume is closed-form, $T = V/(A\\,TE)$. The aperture reduction enters through both opening dimensions; the page finds it by Brent root finding on the same forward model, between 0 % (a 1:1 aperture) and the largest reduction that still leaves room for the corner radius. Both are checked against the release limits afterwards: a foil thick enough for the volume may be too thick for the area ratio.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>The finest aperture sets the foil.</strong> One foil serves the whole board, so check the smallest BGA and fine-pitch openings first. If they need a thinner foil than the large parts, use a step stencil or overprint the large pads.</li>
<li><strong>Below 0.66.</strong> Release becomes unreliable and transfer efficiency falls and scatters. Electroformed or nano-coated foils and smooth, laser-cut walls help push the practical limit lower; measure with SPI.</li>
<li><strong>Reduction.</strong> Apertures are often reduced 5–10 % against the pad to keep paste off the solder mask and reduce bridging and solder balls. Large thermal pads are window-paned to limit voiding and float.</li>
<li><strong>Transfer efficiency</strong> above 100 % in SPI data usually means gasketing or smear; below 100 % at small area ratios means paste left in the aperture.</li>
<li><strong>What the volume does not include:</strong> solder wicking into vias, voids, and the part’s own termination plating.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>IPC-7525B, <em>Stencil Design Guidelines</em>, IPC, 2011, §3.2.1 (area ratio and aspect ratio).</li>
<li>Kester, “Calculating Solder Paste Volume Percent,” knowledge-base note (measured flux density 1.013 g/ml).</li>
<li>Kurtz Ersa, Solder Wiki, “Metal content” (about 90 % metal by weight ≈ 50 % by volume).</li>
<li>Indium Corporation, <em>Solder Alloy Directory</em>, form 97720 (measured alloy densities: Sn63Pb37 8.40, SAC305 and SAC387 7.40, Sn96.5Ag3.5 7.50, Bi58Sn42 8.56 g/cm³; a rule of mixtures from the pure metals gives up to about 2 % less for the tin–silver alloys, so the measured values are used).</li>
<li>IPC J-STD-005, <em>Requirements for Soldering Pastes</em> (metal content definition and tolerance).</li>
</ul>`,
    },
  ],
};
