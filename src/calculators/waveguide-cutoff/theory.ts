import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Rectangular waveguide — how this calculator works',
    lead:
      'A hollow metal pipe carries microwaves only above a cutoff frequency set by its inner size. This page lists every TE and TM mode up to about twice the operating frequency, says which ones propagate, and gives the guide wavelength, phase and group velocity, wave impedance and loss of the mode you pick. It can also solve for the width that puts a mode at a chosen cutoff, or for the frequency or width that gives a chosen guide wavelength. The field equations are the standard ones of Pozar, <em>Microwave Engineering</em>, chapter 3.',
  },
  sections: [
    {
      title: 'Cutoff frequencies',
      html: `<p>Inside a guide of width $a$ and height $b$ ($a \\ge b$) filled with a dielectric $\\varepsilon_r$, the fields must vanish on the walls in a whole number of half-wavelengths across each dimension. That fixes the transverse wavenumber of mode $(m,n)$:</p>
$$k_c = \\sqrt{\\left(\\frac{m\\pi}{a}\\right)^2 + \\left(\\frac{n\\pi}{b}\\right)^2}$$
$$f_{c,mn} = \\frac{c}{2\\sqrt{\\varepsilon_r}}\\sqrt{\\left(\\frac{m}{a}\\right)^2 + \\left(\\frac{n}{b}\\right)^2}$$
<p>TE modes exist for any $m,n \\ge 0$ except $m=n=0$; TM modes need both $m \\ge 1$ and $n \\ge 1$. TE$_{mn}$ and TM$_{mn}$ with the same indices share a cutoff (they are <em>degenerate</em>). With $a > 2b$ the lowest mode is TE$_{10}$, $f_c = c/(2a\\sqrt{\\varepsilon_r})$: its cutoff wavelength is twice the broad-wall width, and it does not depend on $b$ at all. The next modes are TE$_{20}$ at $2f_{c10}$ and TE$_{01}$ at $c/(2b\\sqrt{\\varepsilon_r})$. Standard guides use $b \\approx a/2$ so that both arrive together and the single-mode band is a full octave.</p>`,
    },
    {
      title: 'Propagation above and below cutoff',
      html: `<p>With $k = \\omega\\sqrt{\\varepsilon_r}/c$ the wavenumber of the filling, each mode has</p>
$$\\beta = \\sqrt{k^2 - k_c^2} = k\\sqrt{1-(f_c/f)^2}$$
<p>Above cutoff $\\beta$ is real and the mode carries power. The guide wavelength $\\lambda_g = 2\\pi/\\beta$ is longer than the wavelength in the filling, the phase velocity $v_p = \\omega/\\beta$ is faster than light in the filling and the group velocity $v_g = v^2\\beta/\\omega$ is slower; $v_pv_g = v^2$. The wave impedances are</p>
$$Z_{TE} = \\frac{k\\eta}{\\beta},\\qquad Z_{TM} = \\frac{\\beta\\eta}{k},\\qquad \\eta = \\frac{\\eta_0}{\\sqrt{\\varepsilon_r}}$$
<p>Below cutoff $\\beta$ becomes imaginary: the field decays as $e^{-\\alpha z}$ with $\\alpha = \\sqrt{k_c^2-k^2}$ and carries no power. Far below cutoff $\\alpha \\to k_c$, so TE$_{10}$ in an air guide falls by $27.3/a$ dB (a in the same unit as the length). That is the principle of waveguide-below-cutoff vents and attenuators.</p>`,
    },
    {
      title: 'Losses',
      html: `<p><strong>Conductor loss</strong> uses the perturbation method: the lossless fields drive surface currents in walls of surface resistance $R_s = \\sqrt{\\omega\\mu_0/2\\sigma}$, and $\\alpha_c = P_\\ell/2P$, the power lost per metre over twice the power carried. The page evaluates the wall integrals in closed form for any TE or TM mode. For TE$_{10}$ it gives Pozar’s eq. 3.96,</p>
$$\\alpha_c = \\frac{R_s}{a^3 b\\,\\beta k\\eta}\\left(2b\\pi^2 + a^3k^2\\right)\\ \\text{Np/m}$$
<p>and for TM$_{mn}$ the classic $\\alpha_c = \\dfrac{2R_s}{b\\eta\\sqrt{1-(f_c/f)^2}}\\,\\dfrac{m^2(b/a)^3+n^2}{m^2(b/a)^2+n^2}$. Losses grow steeply near cutoff, have a broad minimum around 2–3 $f_c$ for TE$_{10}$, and fall with a larger $b$. The method assumes the fields barely change, so it fails within a few percent of cutoff; the attenuation graph starts at $1.03f_c$.</p>
<p><strong>Dielectric loss</strong> of a filling with loss tangent $\\tan\\delta$ is $\\alpha_d = k^2\\tan\\delta/2\\beta$ (Pozar eq. 3.29), valid for $\\tan\\delta \\ll 1$. Both are converted with 1 Np = 8.686 dB.</p>`,
    },
    {
      title: 'Bands and the mode table',
      html: `<p>Standard practice uses TE$_{10}$ between about $1.25f_c$ and $1.9f_c$. Below that, loss and dispersion climb toward cutoff. Above it, the frequency is within about 5 % of the TE$_{20}$/TE$_{01}$ cutoff, where tolerances or a dielectric insert could let a higher mode propagate. The EIA WR bands follow this rule: WR-90 has $f_c = 6.56$ GHz and is used from 8.2 to 12.4 GHz.</p>
<p>The <em>Tables</em> tab lists every mode up to about $2.2f$, coloured for single-mode operation. The dominant mode is green when it propagates comfortably ($f \\ge 1.1f_c$), yellow within ±10 % of its cutoff and red when cut off. A higher mode is red when it also propagates (multimode), yellow when its cutoff is less than 10 % above $f$, and uncoloured when it is safely cut off. A yellow mode still matters, because it decays slowly and can couple two discontinuities that are close together. In a square guide TE$_{10}$ and TE$_{01}$ share one cutoff, so there is no single-mode band at all.</p>`,
    },
    {
      title: 'Power handling',
      html: `<p>For TE$_{10}$ the peak transverse field $E_0$ sits in the middle of the broad wall, and the power carried is $P = abE_0^2/(4Z_{TE})$ (from Pozar §3.3). Setting $E_0$ to the breakdown field of the filling gives the theoretical maximum power, about 1 MW for WR-90 in dry air at sea level. Real systems derate it by at least 2: a standing wave raises the peak field by $(1+|\\Gamma|)$, and humidity, dust, altitude and long pulses all lower the breakdown field.</p>`,
    },
    {
      title: 'Solving for width or frequency',
      html: `<p>Every unknown has an exact inverse of the same forward equations, so a solved value fed back reproduces the target:</p>
<ul>
<li><strong>Width for a target cutoff</strong>: $\\left(m/a\\right)^2 = (2f_c\\sqrt{\\varepsilon_r}/c)^2 - (n/b)^2$. It needs $m \\ge 1$, and the target must lie above the part that $b$ alone sets.</li>
<li><strong>Frequency for a target $\\lambda_g$</strong>: $f = \\sqrt{f_c^2 + (v/\\lambda_g)^2}$ with $v = c/\\sqrt{\\varepsilon_r}$.</li>
<li><strong>Width for a target $\\lambda_g$ at $f$</strong>: the needed cutoff is $f_c = \\sqrt{f^2-(v/\\lambda_g)^2}$, which requires $\\lambda_g$ longer than the wavelength in the filling. Then the width follows as above.</li>
</ul>
<p>The cutoff and $\\lambda_g$ boxes are normally results (green). Click ◎ on one of them to turn it into a target.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Roughness, silver or gold plating, and flange joints typically add 10–50 % to the smooth-wall conductor loss at X band, and more at millimetre waves.</li>
<li>Reduced-height guides (small $b$) are used to match to devices, but the loss rises roughly as $1/b$ and the power rating falls with $b$.</li>
<li>A dielectric filling shrinks the guide by $\\sqrt{\\varepsilon_r}$ but adds $\\alpha_d$, which usually dominates at microwave frequencies with PTFE.</li>
<li>Higher modes generated at a discontinuity decay within a short distance if they are well below cutoff. Leave a few times $1/\\alpha$ between discontinuities that you design separately.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012: §3.1 (TE/TM waves, wave impedance, dielectric loss eq. 3.29), §3.3 (rectangular waveguide, Table 3.2 fields, eq. 3.96, Example 3.1), Appendix F (conductivities), Appendix G (dielectrics), Appendix I (standard waveguide data).</li>
<li>S. Ramo, J. R. Whinnery, T. Van Duzer, <em>Fields and Waves in Communication Electronics</em>, 3rd ed., Wiley, 1994, §8.4 (attenuation of rectangular-guide modes).</li>
<li>N. Marcuvitz, <em>Waveguide Handbook</em>, MIT Radiation Laboratory Series vol. 10, McGraw-Hill, 1951, §2.2.</li>
<li>EIA RS-261-B, <em>Rectangular Waveguides (WR3 to WR2300)</em>; IEC 60153-2, <em>Hollow metallic waveguides — relevant specifications for ordinary rectangular waveguides</em>.</li>
</ul>`,
    },
  ],
};
