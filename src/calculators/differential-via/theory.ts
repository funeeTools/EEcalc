import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Differential vias — how this calculator works',
    lead:
      'A differential via pair carries the signal vertically through the board, where the controlled-impedance stripline geometry is lost. There is no exact formula for a real via, because its return current flows only at the plane layers and through nearby ground vias. This page estimates the barrel impedance with the three idealised TEM cross-sections that bracket the real return path, and models the unused barrel below the exit layer as an open stub, whose quarter-wave resonance is well defined and usually the bigger problem.',
  },
  sections: [
    {
      title: 'Barrel impedance: three return paths',
      html: `<p>Seen from above, the barrels of diameter $d$ at pitch $p$ pass through clearances (antipads) in the ground planes. With $\\eta = \\eta_0/\\sqrt{\\varepsilon_r}$:</p>
<p><strong>Separate antipads, dense planes.</strong> Each barrel is treated as the centre conductor of a coaxial line whose outer conductor is the antipad edge of diameter $D$. With planes on most layers they screen the two barrels from each other, so the odd-mode impedance is that of one coax:</p>
$$Z_{diff} = 2\\cdot\\frac{\\eta}{2\\pi}\\ln\\frac Dd$$
<p><strong>Shared antipad or ground-via ring.</strong> Both barrels sit inside one round opening, or a ring of stitching vias, of diameter $D$. For thin conductors the image solution of a balanced pair inside a circular shield gives, with $\\sigma = p/D$,</p>
$$Z_{diff} = \\frac{\\eta}{\\pi}\\ln\\!\\left[\\frac{2p}{d}\\cdot\\frac{1-\\sigma^2}{1+\\sigma^2}\\right]$$
<p><strong>No nearby return.</strong> Two parallel round conductors, exact for any $p/d$:</p>
$$Z_{diff} = \\frac{\\eta}{\\pi}\\operatorname{arccosh}\\frac pd$$
<p>The shielded-pair formula tends to $\\frac\\eta\\pi\\ln(2p/d)$ as $D\\to\\infty$, which is the thin-wire form of the arccosh; it reads 1.6 % high at $p/d = 3$ and 5 % at $p/d = 2$, and the page warns below 3.</p>`,
    },
    {
      title: 'How accurate is this?',
      html: `<p>Each formula is an exact (or thin-wire exact) 2-D solution for its idealised geometry. A real via is 3-D: between the planes the field spreads into the parallel-plate region; pads and non-functional pads add capacitance; the return current reaches the planes only at their edges. No published closed form bounds the error in general, so treat the result as a first estimate of which way to move $D$, $p$ and $d$, and confirm a critical design with a 3-D field solver or a TDR coupon. In practice the separate-antipad (coax) model suits boards with many planes and a stitching via next to each signal via; the shared model suits an oval antipad around the pair; the two-wire model is the high-impedance limit.</p>`,
    },
    {
      title: 'The stub',
      html: `<p>If the signal leaves the via on an inner layer, the barrel continues to the far side of the board. That remainder, of length $\\ell_{stub} = H-\\ell_{use}$ (or the residual after back-drilling), is an open-circuited transmission line hanging off the signal path. It looks like a short circuit at its quarter-wave frequency:</p>
$$f_{res} = \\frac{c}{4\\,\\ell_{stub}\\sqrt{\\varepsilon_r}}$$
<p>This is an upper bound: the pad and plane capacitance at the stub end load it and pull the resonance lower. To estimate the loss, the page cascades the ABCD matrices of the used barrel section (length $\\ell_{use}$, impedance $Z_{diff}$) and the shunt stub, whose input admittance is $Y = \\tanh(\\gamma\\ell_{stub})/Z_{diff}$, between traces of impedance $Z_{line}$, with $\\gamma = \\alpha_d + j\\beta$ and dielectric loss $\\alpha_d = \\pi f\\sqrt{\\varepsilon_r}\\tan\\delta/c$. The insertion loss is $-20\\log_{10}|S_{21}|$. The page warns when the stub adds more than 1 dB at the frequency of interest.</p>`,
    },
    {
      title: 'Lumped single-via estimates',
      html: `<p>For one via, Johnson and Graham estimate the pad-to-plane capacitance (dimensions in inches)</p>
$$C \\approx \\frac{1.41\\,\\varepsilon_r\\,T\\,D_1}{D_2-D_1}\\ \\text{pF}$$
<p>with $T$ the board thickness, $D_1$ the pad and $D_2$ the antipad diameter. It needs a real per-via antipad, so the page shows it only for the separate-antipad model; a ground-via ring is not an antipad.</p>
<p>For the barrel inductance the page uses the partial self-inductance of a straight round conductor carrying its current on the surface (Rosa 1908; Grover 1946):</p>
$$L = \\frac{\\mu_0 h}{2\\pi}\\left[\\ln\\frac{4h}{d}-1\\right] = 5.08\\,h\\left[\\ln\\frac{4h}{d}-1\\right]\\ \\text{nH}\\quad(h,\\ d\\ \\text{in inches})$$
<p>Johnson and Graham print the same expression with $+1$ in place of $-1$. That is $2\\times5.08h$ nH larger: it equals the loop inductance of a coaxial return about $2e\\,h \\approx 5.4h$ away rather than a partial inductance, which is how Johnson explained it in a 2001 SI-LIST thread, where he also noted that short vias need a fuller formula. The book form is shown beside the partial inductance for comparison; for a 0.063 in via with a 0.016 in drill they give 0.56 nH and 1.20 nH. Both assume $h \\gg d$ and say nothing about the pair, so the page also gives the pair’s loop inductance and capacitance over $\\ell_{use}$ from the TEM model, $L = Z_{diff}t_d$ and $C = t_d/Z_{diff}$, which are consistent with the impedance shown.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>For a target $Z_{diff}$ the page solves the chosen model for $D$, $p$ or $d$ by Brent root finding within the geometrically valid range (separate antipads must not overlap; a shared ring must clear both barrels). Some unknowns do not enter some models: with separate antipads $Z_{diff}$ does not depend on the pitch, and with no return path it does not depend on $D$.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Stubs first.</strong> At 25 Gb/s and above, a stub of a millimetre or more usually costs more than any impedance mismatch. Exit on a layer near the far side, use blind vias, or back-drill to a 0.1–0.25 mm residual stub.</li>
<li><strong>Raise the impedance</strong> of a low via by enlarging the antipad (an oval around the pair), removing non-functional pads, and tightening the pitch only if the ring stays clear.</li>
<li><strong>Return vias.</strong> A stitching via next to each signal via (or a ring) gives the return current a short path when the signal changes reference planes.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, Table 2.1 (coaxial and two-wire lines), ch. 2 (lossy and terminated lines) and §4.4 (ABCD matrices).</li>
<li><em>Reference Data for Engineers: Radio, Electronics, Computer and Communications</em>, 8th ed., Sams, 1993, transmission lines: balanced shielded line.</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991 (shielded balanced and two-wire lines).</li>
<li>H. Johnson, M. Graham, <em>High-Speed Digital Design: A Handbook of Black Magic</em>, Prentice Hall, 1993, ch. 7 (via capacitance and inductance).</li>
<li>E. B. Rosa, “The self and mutual inductances of linear conductors,” <em>Bulletin of the Bureau of Standards</em>, vol. 4, no. 2, pp. 301–344, 1908.</li>
<li>F. W. Grover, <em>Inductance Calculations</em>, Van Nostrand, 1946 (Dover reprint 2004), straight round wire.</li>
<li>SI-LIST archive, “approximations for partial self inductance” thread, 2001 (qsl.net/wb6tpu/si-list), discussion of the +1 / −1 forms with H. Johnson.</li>
<li>B. Simonovich, “Practical Differential Via Modeling Made Easy,” I-Connect007 (twin-rod inductance and coaxial-type capacitance for a via pair, compared with VNA measurement).</li>
</ul>`,
    },
  ],
};
