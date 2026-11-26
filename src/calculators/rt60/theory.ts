import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Reverberation time — how this calculator works',
    lead:
      'RT60 is the time a diffuse sound field takes to decay by 60 dB after the source stops. This page computes it per octave band from 125 Hz to 4 kHz with the three classic statistical formulas (Sabine, Eyring and Millington–Sette), using published absorption coefficients for each surface and ISO 9613-1 air absorption. It can also size an absorbing treatment so that the room meets a target, such as the 0.6 s that ANSI S12.60 sets for classrooms.',
  },
  sections: [
    {
      title: 'Absorption',
      html: `<p>Each surface of area $S_i$ absorbs a fraction $\\alpha_i$ of the sound energy that strikes it at random incidence. The room’s equivalent absorption area and mean absorption coefficient are</p>
$$A = \\sum_i S_i\\alpha_i\\ \\ [\\text{m}^2\\ \\text{sabins}]$$
$$\\bar\\alpha = \\frac{A}{S}$$
$$S = 2(LW + LH + WH)$$
<p>On this page every boundary (floor, ceiling, walls) gets one “rest of” material, and patches (windows, curtains, audience areas, treatment) take their area out of it. Coefficients are octave-band values measured in a reverberation room (ASTM C423 / ISO 354). Laboratory values can exceed 1 because of edge diffraction around the test sample.</p>`,
    },
    {
      title: 'The three formulas',
      html: `<p>With $K = 24\\ln 10/c$ (0.161 s/m at 20 °C) and the air absorption term $4mV$:</p>
$$\\text{Sabine:}\\quad T = \\frac{K\\,V}{A + 4mV}$$
$$\\text{Eyring:}\\quad T = \\frac{K\\,V}{-S\\ln(1-\\bar\\alpha) + 4mV}$$
$$\\text{Millington–Sette:}\\quad T = \\frac{K\\,V}{-\\sum_i S_i\\ln(1-\\alpha_i) + 4mV}$$
<p>Sabine’s formula comes from a continuous decay and works well in live rooms ($\\bar\\alpha$ below about 0.2). It wrongly predicts a finite reverberation time for a room with perfectly absorbing walls. Eyring’s formula treats the decay as a series of reflections, each removing a fraction $\\bar\\alpha$ of the energy; it gives $T \\to 0$ as $\\bar\\alpha \\to 1$ and is the better choice for absorbent rooms. Millington and Sette apply the logarithm to every surface separately, so one small patch with $\\alpha$ close to 1 can dominate the result; it is shown for comparison. Inside the logarithms, coefficients are capped at 0.99.</p>`,
    },
    {
      title: 'Air absorption',
      html: `<p>In large rooms the air itself absorbs at high frequencies. ISO 9613-1 gives the pure-tone attenuation coefficient $\\alpha_{air}$ (dB/m) from temperature, humidity and pressure through the relaxation frequencies of oxygen and nitrogen. The energy attenuation coefficient is $m = \\alpha_{air}/(10\\lg e) = \\alpha_{air}/4.343$, and its contribution to the absorption area is $4mV$. At 20 °C and 50 % RH it adds about 0.027 m² per m³ at 4 kHz, which shortens the high-frequency RT60 of a concert hall noticeably but hardly matters in an office.</p>`,
    },
    {
      title: 'Validity: diffuse field and Schroeder frequency',
      html: `<p>All three formulas assume a diffuse field: sound arriving equally from all directions, with the absorption spread over the room. Long, flat or very unevenly treated rooms (an absorbent ceiling above hard walls and floor) decay more slowly than predicted, often with a double slope.</p>
<p>Below the Schroeder frequency</p>
$$f_S \\approx 2000\\sqrt{T/V}$$
<p>individual room modes are spaced too far apart to overlap, and the decay depends on where you listen. In small rooms this includes the 125 Hz and even 250 Hz bands; the page warns when a band falls below $f_S$. The critical distance, where direct and reverberant sound are equally loud for an omnidirectional source, is $r_c = \\sqrt{A/16\\pi} \\approx 0.057\\sqrt{V/T}$.</p>`,
    },
    {
      title: 'Sizing the treatment (solve for area)',
      html: `<p>The treatment replaces part of the “rest of” material on the chosen surface. As its area grows the RT60 falls monotonically (when the treatment absorbs more than what it covers), so the page finds the area that gives the target with Brent’s method on the same formula used for the result. It then reports the area, how much of the free surface it uses, and the octave-band RT60 with it in place. If even full coverage misses the target, it says so and suggests treating another surface.</p>
<p>The “band(s) judged” setting decides what has to meet the target: the 500 Hz–1 kHz mean (the usual single-number value) or the worst of the 500 Hz, 1 kHz and 2 kHz bands, which is how ANSI/ASA S12.60 states its classroom limit (0.6 s for rooms up to 283 m³, 0.7 s up to 566 m³).</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Coefficients vary.</strong> The same nominal material differs between products, thicknesses and mountings; panels spaced off the wall absorb more at low frequencies. Use the manufacturer’s ASTM C423 / ISO 354 data for the product you will install (choose “Custom” and type it in).</li>
<li><strong>Furniture and people</strong> add absorption. An audience in upholstered seats is entered as an area patch on the floor.</li>
<li><strong>Low frequencies</strong> are the hardest to control: thin porous panels do little at 125 Hz. Thick panels with an air gap, or tuned membrane absorbers, are needed there.</li>
<li><strong>Accuracy.</strong> Expect the predictions to be within 10–20 % of a measurement in rooms that satisfy the diffuse-field assumptions, and worse otherwise.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>H. Kuttruff, <em>Room Acoustics</em>, 6th ed., CRC Press, 2016, ch. 5 (Sabine, Eyring and Millington–Sette formulas; air absorption; critical distance) and ch. 3 (Schroeder frequency).</li>
<li>W. C. Sabine, <em>Collected Papers on Acoustics</em>, Harvard University Press, 1922; C. F. Eyring, “Reverberation time in ‘dead’ rooms”, <em>J. Acoust. Soc. Am.</em> 1, 217 (1930); G. Millington, <em>J. Acoust. Soc. Am.</em> 4, 69 (1932); W. J. Sette, <em>J. Acoust. Soc. Am.</em> 4, 193 (1933).</li>
<li>M. R. Schroeder, K. H. Kuttruff, “On frequency response curves in rooms”, <em>J. Acoust. Soc. Am.</em> 34, 76 (1962).</li>
<li>ISO 9613-1:1993, <em>Acoustics — Attenuation of sound during propagation outdoors — Part 1: Calculation of the absorption of sound by the atmosphere</em>.</li>
<li>R. A. Hedeen, <em>Compendium of Materials for Noise Control</em>, NIOSH Publication 80-116, 1980, Table 5 (absorption coefficients of general building materials and furnishings).</li>
<li>Owens Corning, <em>Fiberglas™ 703 and 705 Series Insulation</em> product data sheet, pub. 10021736 (ASTM C423, Type A mounting); Armstrong World Industries, <em>UL Classified Acoustical Performance Summary</em> (ASTM C423, E-400 mounting).</li>
<li>ANSI/ASA S12.60-2010/Part 1, <em>Acoustical performance criteria, design requirements, and guidelines for schools</em>.</li>
</ul>`,
    },
  ],
};
