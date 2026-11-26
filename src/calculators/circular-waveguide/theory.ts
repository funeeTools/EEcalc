import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Circular waveguide — how this calculator works',
    lead:
      'A round metal pipe guides microwaves in TE and TM modes whose cutoffs are set by the zeros of Bessel functions. This page lists every mode up to about twice the operating frequency, shows which ones propagate, and gives the guide wavelength, velocities, wave impedance and conductor and dielectric loss of the mode you choose. It also solves for the radius that puts a mode at a target cutoff, or for the frequency or radius that gives a target guide wavelength. The equations follow Pozar, <em>Microwave Engineering</em>, §3.4.',
  },
  sections: [
    {
      title: 'Cutoffs from Bessel zeros',
      html: `<p>In a pipe of inner radius $a$, the fields vary as $\\cos n\\phi$ around the axis and as a Bessel function $J_n(k_c\\rho)$ across the radius. The wall condition picks the transverse wavenumber:</p>
$$\\text{TE}_{nm}:\\ J_n'(k_ca) = 0 \\Rightarrow k_c = \\frac{p'_{nm}}{a}$$
$$\\text{TM}_{nm}:\\ J_n(k_ca) = 0 \\Rightarrow k_c = \\frac{p_{nm}}{a}$$
$$f_{c,nm} = \\frac{p\\,c}{2\\pi a\\sqrt{\\varepsilon_r}}$$
<p>The page tabulates $p'_{nm}$ and $p_{nm}$ for $n \\le 7$, $m \\le 5$ to 15 significant digits. The lowest are $p'_{11} = 1.8412$ (TE$_{11}$, dominant), $p_{01} = 2.4048$ (TM$_{01}$), $p'_{21} = 3.0542$ (TE$_{21}$) and $p'_{01} = p_{11} = 3.8317$ (TE$_{01}$ and TM$_{11}$, degenerate). So the single-mode band runs from the TE$_{11}$ cutoff to 1.306 times it, much narrower than the octave of a standard rectangular guide.</p>`,
    },
    {
      title: 'Propagation constants and impedance',
      html: `<p>Every mode has $\\beta = \\sqrt{k^2-k_c^2}$ with $k = \\omega\\sqrt{\\varepsilon_r}/c$, so $\\lambda_g = 2\\pi/\\beta$, $v_p = \\omega/\\beta$, $v_g = v^2\\beta/\\omega$, $Z_{TE} = k\\eta/\\beta$ and $Z_{TM} = \\beta\\eta/k$, exactly as in a rectangular guide. Below cutoff the mode decays at $\\alpha = \\sqrt{k_c^2-k^2}$. That is why a honeycomb of small tubes works as an air vent that blocks microwaves: well below cutoff each cell attenuates about $16/a$ dB per unit length for TE$_{11}$ (with $a$ in the same unit).</p>`,
    },
    {
      title: 'Conductor and dielectric loss',
      html: `<p>With the surface resistance $R_s = \\sqrt{\\omega\\mu_0/2\\sigma}$ and $\\eta$ the intrinsic impedance of the filling, the perturbation method gives</p>
$$\\alpha_c^{TE_{nm}} = \\frac{R_s}{a\\eta\\sqrt{1-(f_c/f)^2}}\\left[\\left(\\frac{f_c}{f}\\right)^2 + \\frac{n^2}{p'^2_{nm}-n^2}\\right]$$
$$\\alpha_c^{TM_{nm}} = \\frac{R_s}{a\\eta\\sqrt{1-(f_c/f)^2}}$$
<p>For TE$_{11}$ this is Pozar’s eq. 3.133. The TE$_{0m}$ modes are special: with $n = 0$ only the first term remains, and since $R_s \\propto \\sqrt f$ while $(f_c/f)^2$ falls as $f^{-2}$, their loss <em>decreases</em> as $f^{-3/2}$ far above cutoff. That was the basis of the long-haul TE$_{01}$ millimetre-wave trunk systems of the 1960s and 70s. In practice TE$_{01}$ is degenerate with TM$_{11}$, and it is not the lowest mode, so bends and out-of-roundness convert its power into other modes. It needs mode filters and very straight pipe.</p>
<p>A dielectric filling adds $\\alpha_d = k^2\\tan\\delta/2\\beta$ (Pozar eq. 3.29), for $\\tan\\delta \\ll 1$. The perturbation method fails within a few percent of cutoff, where the formulas diverge, so the loss graph starts each curve at $1.1f_c$.</p>`,
    },
    {
      title: 'The mode table',
      html: `<p>The <em>Tables</em> tab lists every mode up to about $2.2f$, with its Bessel zero and cutoff. The colours judge single-mode operation. The dominant TE$_{11}$ row is green when it propagates comfortably ($f \\ge 1.1f_c$), yellow within ±10 % of its cutoff and red when cut off. A higher mode is red when it also propagates, yellow when its cutoff is less than 10 % above $f$, and uncoloured when it is safely cut off. Modes with $n \\ge 1$ come in two orthogonal polarisations ($\\cos n\\phi$ and $\\sin n\\phi$) with the same cutoff. A slightly elliptical pipe separates them and slowly rotates the polarisation of TE$_{11}$, which matters for polarisers and feeds. If the pipe is so large that modes beyond the tabulated range ($n > 7$ or $m > 5$) propagate, the page says so and reports the count as a lower bound.</p>`,
    },
    {
      title: 'Solving for radius or frequency',
      html: `<p>All inverses are exact, so a solved value fed back reproduces the target:</p>
<ul>
<li><strong>Radius for a target cutoff</strong>: $a = p\\,c/(2\\pi f_c\\sqrt{\\varepsilon_r})$, for whichever mode you selected.</li>
<li><strong>Frequency for a target $\\lambda_g$</strong>: $f = \\sqrt{f_c^2 + (v/\\lambda_g)^2}$, $v = c/\\sqrt{\\varepsilon_r}$.</li>
<li><strong>Radius for a target $\\lambda_g$ at $f$</strong>: the needed cutoff $\\sqrt{f^2-(v/\\lambda_g)^2}$ exists only if $\\lambda_g$ is longer than the wavelength in the filling. The radius then follows from the first rule.</li>
</ul>
<p>The cutoff and $\\lambda_g$ boxes are normally results (green). Click ◎ on one of them to turn it into a target.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Circular guide is used where rotational symmetry helps: rotary joints (TM$_{01}$, with TE$_{11}$ suppressed), polarisers and orthomode transducers for dual-polarisation feeds (TE$_{11}$), and horn throats.</li>
<li>Operate TE$_{11}$ comfortably inside its narrow single-mode band. Above about 0.95 of the TM$_{01}$ cutoff, tolerances or a dielectric plug can let TM$_{01}$ propagate.</li>
<li>Roughness and plating raise the real conductor loss above the smooth-wall value, typically by 10–50 %.</li>
<li>For a vent or a waveguide-below-cutoff attenuator, add 5–10 dB of margin to the evanescent figure for fields that leak around the cell walls and for the near-field coupling at both ends.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §3.4 (circular waveguide, Tables 3.4 and 3.5, eq. 3.133, Example 3.2), §3.1 (eq. 3.29), Appendices F and G.</li>
<li>M. Abramowitz, I. A. Stegun, <em>Handbook of Mathematical Functions</em>, NBS AMS 55, 1964, Table 9.5 (zeros of $J_n$ and $J_n'$).</li>
<li>N. Marcuvitz, <em>Waveguide Handbook</em>, MIT Radiation Laboratory Series vol. 10, McGraw-Hill, 1951, §2.3 (circular guides, attenuation).</li>
<li>R. E. Collin, <em>Foundations for Microwave Engineering</em>, 2nd ed., IEEE Press / McGraw-Hill, 1992, ch. 3.</li>
</ul>`,
    },
  ],
};
