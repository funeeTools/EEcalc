import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Angle units — how this converter works',
    lead:
      'Every angle unit in use is a fixed fraction of one full turn, so converting between them is a single multiplication by an exact ratio. Pick the unit you have, type the value, and the page shows it in degrees, radians, gradians, turns, arcminutes, arcseconds, degrees–minutes–seconds and NATO mils, together with its normalised value and its sine, cosine and tangent.',
  },
  sections: [
    {
      title: 'One turn in every unit',
      html: `<p>A full turn is</p>
$$1\\ \\text{turn} = 360^\\circ = 2\\pi\\ \\text{rad} = 400\\ \\text{gon}$$
$$= 21\\,600' = 1\\,296\\,000'' = 6400\\ \\text{mil (NATO)}$$
<p>so a value $x$ in unit $a$ becomes $x\\,N_b/N_a$ in unit $b$, where $N$ is the number of units per turn. The radian is the SI coherent unit of plane angle (the ratio of arc length to radius); the degree, minute and second are accepted for use with the SI with $1^\\circ = \\pi/180$ rad, $1' = (1/60)^\\circ$ and $1'' = (1/60)'$ exactly (BIPM SI Brochure, Table 8). The gon (gradian) divides a right angle into 100 parts and is common in surveying (ISO 80000-3).</p>
<p>Two useful small-angle figures: $1'' = 4.848\\ \\mu\\text{rad}$ and $1\\ \\text{mrad} = 0.0573^\\circ = 3.44'$.</p>`,
    },
    {
      title: 'Degrees, minutes, seconds',
      html: `<p>DMS writes the magnitude of an angle in degrees as whole degrees $D$, whole minutes $M$ and decimal seconds $S$:</p>
$$|\\theta| = D + \\frac{M}{60} + \\frac{S}{3600}\\ \\text{degrees}$$
$$0 \\le M < 60,\\ 0 \\le S < 60$$
<p>The sign belongs to the whole angle, which is why this page keeps it in a separate row: $-0^\\circ\\,30'$ cannot be written with a signed degree field. When converting to DMS the seconds are rounded to $10^{-9}{}''$ to remove floating-point noise, and a carry of 60″ or 60′ moves up into the next field.</p>`,
    },
    {
      title: 'Mils: which one?',
      html: `<p>Several “mils” exist. This page uses the <strong>NATO mil</strong>, 6400 to the circle, as used for artillery and land navigation (US Army FM 3-25.26, ch. 6). It approximates a milliradian (6283.2 per circle) but divides evenly by 2, 4, 8 and so on: 1600 mil is a right angle and $1^\\circ \\approx 17.78$ mil. The former Warsaw Pact mil (6000 per circle) and the Swedish streck (6300) are different units and are not converted here. For a true milliradian, use the radian row with the mrad unit.</p>
<p>Do not confuse any angular mil with the length unit mil (a thousandth of an inch) used on PCBs.</p>`,
    },
    {
      title: 'Normalisation and trigonometry',
      html: `<p>An angle and the same angle plus whole turns point in the same direction. The page reduces $\\theta$ to</p>
$$\\theta_{360} = \\theta \\bmod 360^\\circ \\in [0, 360^\\circ)$$
$$\\theta_{180} \\in (-180^\\circ, 180^\\circ]$$
<p>and gives the quadrant and the reference angle (the acute angle to the $x$ axis). Sine, cosine and tangent are evaluated on the reduced angle, and exact multiples of 90° return exact values: $\\sin 180^\\circ$ is 0 rather than the $1.2\\times10^{-16}$ that $\\sin(\\pi)$ gives in floating point, and $\\tan 90^\\circ$ is reported as undefined. Very large angles lose digits on reduction (an angle of $10^6$ turns keeps about 10 of its 16 significant digits after the whole turns are removed), so the page warns above $10^4$ turns.</p>`,
    },
    {
      title: 'Using the page',
      html: `<p>The white row is the input; every green row is computed from it. Click ◎ on a green row to type in that unit instead. The radian row has a rad/mrad unit choice. The diagram draws the reduced angle on the unit circle, with $\\cos\\theta$ along the $x$ axis and $\\sin\\theta$ vertical.</p>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>BIPM, <em>The International System of Units (SI)</em>, 9th edition, 2019, Table 8 (non-SI units accepted for use with the SI: degree, minute, second of arc).</li>
<li>ISO 80000-3:2019, <em>Quantities and units — Part 3: Space and time</em> (plane angle: radian, degree, minute, second, gon; revolution).</li>
<li>Headquarters, Department of the Army, <em>FM 3-25.26 Map Reading and Land Navigation</em>, 2005, ch. 6 “Direction” (degrees and mils: 6400 mils to the circle).</li>
</ol>`,
    },
  ],
};
