import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'RF power density and exposure limits — how this calculator works',
    lead:
      'Far from an antenna, the radiated power spreads over a sphere, so the power density falls with the square of the distance. This page computes the density and the equivalent plane-wave E and H fields at a point, compares them with the FCC maximum permissible exposure table or the ICNIRP 2020 reference levels, and solves for the distance or the transmit power that gives a chosen density. It also checks whether the point is far enough away for the far-field formula to hold.',
  },
  sections: [
    {
      title: 'Far-field power density',
      html: `<p>An antenna with gain $G$ fed with power $P_t$ radiates as an isotropic source of $\\mathrm{EIRP} = P_t G$ in its main beam. At distance $r$ the power crosses a sphere of area $4\\pi r^2$:</p>
$$S = F\\,\\delta\\,\\frac{P_t G}{4\\pi r^2}$$
<p>(FCC OET Bulletin 65, eq. 3). $\\delta$ is the duty factor (the fraction of the averaging time the transmitter is on). $F = 1$ in free space. Near the ground a reflected wave can arrive in phase with the direct one; OET-65 takes a field reflection coefficient of 0.6, so the field rises by 1.6 and the density by $F = 1.6^2 = 2.56$ (OET-65 eq. 6).</p>
<p>In the far field the wave is locally plane, with $E/H = \\eta_0 = \\mu_0 c \\approx 376.73\\ \\Omega$:</p>
$$E = \\sqrt{S\\,\\eta_0}$$
$$H = \\frac{E}{\\eta_0}$$
<p>A handy check: $E \\approx \\sqrt{30\\,\\mathrm{EIRP}}/r$ (since $\\eta_0/4\\pi \\approx 30\\ \\Omega$), which is the familiar form in ITU-R P.525.</p>`,
    },
    {
      title: 'Where the formula holds',
      html: `<p>The inverse-square law assumes the point is in the far field. ICNIRP (2020, Appendix A) gives as a rough guide, with $D$ the largest antenna dimension:</p>
<ul>
<li>reactive near field: $r < \\lambda/2\\pi$ — stored energy dominates, $E/H \\ne \\eta_0$, and the density alone says nothing about exposure;</li>
<li>radiative near field: $\\lambda/2\\pi < r < 2D^2/\\lambda$ — the beam has not formed and the density varies strongly with position;</li>
<li>far field: $r > 2D^2/\\lambda$.</li>
</ul>
<p>The page warns inside each near-field region. For large apertures (dish and panel antennas) the on-axis density in the radiative near field is bounded by the power divided by the aperture area; OET-65 §2 gives near-field methods, and a measurement is the usual answer for a compliance claim.</p>`,
    },
    {
      title: 'FCC limits (47 CFR §1.1310, Table 1)',
      html: `<p>With $f$ in MHz and densities in mW/cm² (multiply by 10 for W/m²):</p>
<div style="overflow-x:auto"><table class="kv" style="max-width:640px">
<tr><th style="white-space:normal">Frequency (MHz)</th><th style="white-space:normal">Occupational / controlled</th><th style="white-space:normal">General population / uncontrolled</th></tr>
<tr><td style="white-space:normal;text-align:left">0.3–1.34</td><td style="white-space:normal;text-align:left">614 V/m, 1.63 A/m, (100)*</td><td style="white-space:normal;text-align:left">614 V/m, 1.63 A/m, (100)*</td></tr>
<tr><td style="white-space:normal;text-align:left">1.34–3.0</td><td style="white-space:normal;text-align:left">614 V/m, 1.63 A/m, (100)*</td><td style="white-space:normal;text-align:left">824/f V/m, 2.19/f A/m, (180/f²)*</td></tr>
<tr><td style="white-space:normal;text-align:left">3.0–30</td><td style="white-space:normal;text-align:left">1842/f V/m, 4.89/f A/m, (900/f²)*</td><td style="white-space:normal;text-align:left">824/f V/m, 2.19/f A/m, (180/f²)*</td></tr>
<tr><td style="white-space:normal;text-align:left">30–300</td><td style="white-space:normal;text-align:left">61.4 V/m, 0.163 A/m, 1.0</td><td style="white-space:normal;text-align:left">27.5 V/m, 0.073 A/m, 0.2</td></tr>
<tr><td style="white-space:normal;text-align:left">300–1500</td><td style="white-space:normal;text-align:left">f/300</td><td style="white-space:normal;text-align:left">f/1500</td></tr>
<tr><td style="white-space:normal;text-align:left">1500–100 000</td><td style="white-space:normal;text-align:left">5</td><td style="white-space:normal;text-align:left">1.0</td></tr>
<tr><td style="white-space:normal;text-align:left">Averaging time</td><td style="white-space:normal;text-align:left">6 min</td><td style="white-space:normal;text-align:left">30 min</td></tr>
</table></div>
<p>* plane-wave equivalent power density. Occupational limits apply to people who know about the exposure and can control it; everyone else falls under the general-population limits. The MPE table may stand in for whole-body SAR from 300 kHz to 6 GHz (not for portable devices, i.e. within 20 cm, which are evaluated by SAR under §2.1093) and is always used above 6 GHz (§1.1310(d)).</p>`,
    },
    {
      title: 'ICNIRP 2020 reference levels (Table 5)',
      html: `<p>Whole-body levels averaged over 30 min, $f_M$ in MHz, densities in W/m²:</p>
<div style="overflow-x:auto"><table class="kv" style="max-width:640px">
<tr><th style="white-space:normal">Frequency</th><th style="white-space:normal">Occupational</th><th style="white-space:normal">General public</th></tr>
<tr><td style="white-space:normal;text-align:left">0.1–30 MHz</td><td style="white-space:normal;text-align:left">660/f<sub>M</sub><sup>0.7</sup> V/m, 4.9/f<sub>M</sub> A/m</td><td style="white-space:normal;text-align:left">300/f<sub>M</sub><sup>0.7</sup> V/m, 2.2/f<sub>M</sub> A/m</td></tr>
<tr><td style="white-space:normal;text-align:left">&gt;30–400 MHz</td><td style="white-space:normal;text-align:left">61 V/m, 0.16 A/m, 10</td><td style="white-space:normal;text-align:left">27.7 V/m, 0.073 A/m, 2</td></tr>
<tr><td style="white-space:normal;text-align:left">&gt;400–2000 MHz</td><td style="white-space:normal;text-align:left">3f<sub>M</sub><sup>0.5</sup> V/m, 0.008f<sub>M</sub><sup>0.5</sup> A/m, f<sub>M</sub>/40</td><td style="white-space:normal;text-align:left">1.375f<sub>M</sub><sup>0.5</sup> V/m, 0.0037f<sub>M</sub><sup>0.5</sup> A/m, f<sub>M</sub>/200</td></tr>
<tr><td style="white-space:normal;text-align:left">&gt;2–300 GHz</td><td style="white-space:normal;text-align:left">50</td><td style="white-space:normal;text-align:left">10</td></tr>
</table></div>
<p>Below 30 MHz there is no density level: both E and H must be within their levels, so this page reports the larger of $(E/E_{lim})^2$ and $(H/H_{lim})^2$ as the “% of limit”. Above 30 MHz in the far field one quantity is enough, and the page uses $S$. ICNIRP 2020 also has 6-minute local levels (Table 6) and brief-exposure levels, which this page does not check.</p>`,
    },
    {
      title: 'Solving for distance or power',
      html: `<p>The density is a single closed-form expression, so both inverses are exact:</p>
$$r = \\sqrt{\\frac{F\\,\\delta\\,P_t G}{4\\pi S}}$$
$$P_t = \\frac{4\\pi r^2 S}{F\\,\\delta\\,G}$$
<p>Click ◎ on the distance or the power and type the target density in $S$. Independently of the solve choice, the results always give the <em>compliance distance</em> $r_c$ (where $S$ equals the selected limit) and the largest EIRP that meets the limit at the present distance. The Tables tab checks the same point against all four limit sets.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Use the right gain.</strong> Off the main beam the gain can be 10–30 dB lower; the main-beam figure gives a worst case.</li>
<li><strong>Sum the sources.</strong> At a site with several transmitters, add each one’s fraction of its own limit; the total must stay below 100 %.</li>
<li><strong>Averages, not peaks.</strong> Limits are time averages (6 or 30 min). A duty factor below 100 % reduces the average; a TDD or push-to-talk system is usually assessed at its maximum duty.</li>
<li><strong>Not modelled:</strong> SAR, local (limb or 4 cm²) limits, near-field E/H, body shadowing and the FCC exemption thresholds of §1.1307(b).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>FCC Office of Engineering and Technology, <em>OET Bulletin 65, Evaluating Compliance with FCC Guidelines for Human Exposure to Radiofrequency Electromagnetic Fields</em>, Edition 97-01, 1997, §2 (prediction methods, eqs. 3–6).</li>
<li>47 CFR §1.1310, <em>Radiofrequency radiation exposure limits</em>, Table 1 to paragraph (e)(1) (as amended 2019).</li>
<li>International Commission on Non-Ionizing Radiation Protection, “Guidelines for limiting exposure to electromagnetic fields (100 kHz to 300 GHz)”, <em>Health Physics</em> 118(5):483–524, 2020, Table 5 and Appendix A.</li>
<li>ITU-R Recommendation P.525-4, <em>Calculation of free-space attenuation</em>, 2019 (field strength of an isotropic radiator).</li>
<li>CODATA 2018 recommended values: $\\mu_0 = 1.256\\,637\\,062\\,12\\times10^{-6}$ N/A², $Z_0 = 376.730\\,313\\,668\\ \\Omega$.</li>
</ol>`,
    },
  ],
};
