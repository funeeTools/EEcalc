import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Resistor colour code — how this calculator works',
    lead:
      'Leaded resistors carry their value as coloured bands, and chip resistors as a short printed code; both are defined in IEC 60062. This page reads 3-, 4-, 5- and 6-band parts, finds the bands for a value, reads SMD markings (3-digit, 4-digit and EIA-96), and checks whether the value belongs to one of the IEC 60063 preferred-number series.',
  },
  sections: [
    {
      title: 'Reading the bands',
      html: `<p>Hold the resistor with the bunched-up bands on the left. The first two (or three) bands are significant digits, the next is a power-of-ten multiplier, then come the tolerance and, on 6-band parts, the temperature coefficient:</p>
$$R = \\big(d_1 d_2\\,[d_3]\\big)_{10} \\times 10^{m}$$
<table>
<tr><th>Colour</th><th>Digit</th><th>Multiplier</th><th>Tolerance</th><th>TCR (ppm/K)</th></tr>
<tr><td>Black</td><td>0</td><td>×1</td><td>—</td><td>250</td></tr>
<tr><td>Brown</td><td>1</td><td>×10</td><td>±1 % (F)</td><td>100</td></tr>
<tr><td>Red</td><td>2</td><td>×100</td><td>±2 % (G)</td><td>50</td></tr>
<tr><td>Orange</td><td>3</td><td>×1k</td><td>±0.05 % (W)</td><td>15</td></tr>
<tr><td>Yellow</td><td>4</td><td>×10k</td><td>±0.02 % (P)</td><td>25</td></tr>
<tr><td>Green</td><td>5</td><td>×100k</td><td>±0.5 % (D)</td><td>20</td></tr>
<tr><td>Blue</td><td>6</td><td>×1M</td><td>±0.25 % (C)</td><td>10</td></tr>
<tr><td>Violet</td><td>7</td><td>×10M</td><td>±0.1 % (B)</td><td>5</td></tr>
<tr><td>Grey</td><td>8</td><td>×100M</td><td>±0.01 % (L)</td><td>1</td></tr>
<tr><td>White</td><td>9</td><td>×1G</td><td>—</td><td>—</td></tr>
<tr><td>Gold</td><td>—</td><td>×0.1</td><td>±5 % (J)</td><td>—</td></tr>
<tr><td>Silver</td><td>—</td><td>×0.01</td><td>±10 % (K)</td><td>—</td></tr>
<tr><td>Pink</td><td>—</td><td>×0.001</td><td>—</td><td>—</td></tr>
<tr><td>None</td><td>—</td><td>—</td><td>±20 % (M)</td><td>—</td></tr>
</table>
<p>So yellow-violet-red-gold is $47 \\times 10^2 = 4.7\\ \\text{k}\\Omega$ ±5 %, and brown-black-black-red-brown is $100 \\times 10^2 = 10.0\\ \\text{k}\\Omega$ ±1 %. The 2016 edition of IEC 60062 added pink (×0.001) and the yellow and grey tolerance colours; older charts differ there. The letters are the tolerance codes used in printed markings and part numbers.</p>`,
    },
    {
      title: 'Which end to start from',
      html: `<p>The tolerance band is normally gold or silver, or separated from the others by a wider gap. A first band of black (0) or of gold or silver is a sign that you are reading from the wrong end, because makers never start a value with a zero. The page warns about a black first digit, and about values that are in no preferred series, which also usually mean a misread band (red, orange and brown are easy to confuse under warm light, as are blue, violet and grey).</p>`,
    },
    {
      title: 'Preferred values (IEC 60063)',
      html: `<p>Resistance values are not arbitrary: they come from geometric series with $N$ values per decade, spaced so that adjacent values overlap at the series tolerance. E6 (20 %), E12 (10 %) and E24 (5 %) are tabulated, two-digit series; E48, E96 and E192 are the three-digit values $10^{i/N}$ rounded to three figures (with the one exception that E192 uses 9.20 where the rounding gives 9.19). Every E6 value is in E12 and every E12 value in E24, and likewise E48 ⊂ E96 ⊂ E192 — but the two-digit and three-digit families are separate: 4.7 is E24, while the nearest E96 values are 4.64 and 4.75.</p>
<p>The page reports every series that contains the value, the nearest value in the series you choose, and the graph shows where the value and its tolerance window sit among the preferred values of each series.</p>`,
    },
    {
      title: 'Finding the bands for a value',
      html: `<p>The value is rounded to two significant digits for 3- and 4-band parts, three for 5- and 6-band parts, and the multiplier is the remaining power of ten (pink ×0.001 to white ×10⁹). If the value has more significant digits than the bands can show, the page codes the rounded value and says so: 4.75 kΩ, for example, needs a 5-band (1 %) part — yellow-violet-green-brown-brown. Click ◎ on the resistance to switch between reading bands and finding them; the value is kept.</p>`,
    },
    {
      title: 'SMD codes',
      html: `<ul>
<li><strong>3 digits</strong> (typically E24, ±5 %): two digits and the number of zeros — 472 = 4 700 Ω, 100 = 10 Ω.</li>
<li><strong>4 digits</strong> (typically ±1 %): three digits and the number of zeros — 4702 = 47 000 Ω, 1000 = 100 Ω.</li>
<li><strong>R as decimal point</strong>: 4R7 = 4.7 Ω, R47 = 0.47 Ω, 10R0 = 10.0 Ω.</li>
<li><strong>EIA-96</strong> (small 1 % parts, too small for four characters): two digits give the position 01–96 of the value in the E96 series, and a letter gives the multiplier — Z ×0.001, Y or R ×0.01, X or S ×0.1, A ×1, B or H ×10, C ×100, D ×1k, E ×10k, F ×100k. So 01C = 100 × 100 = 10.0 kΩ and 68X = 499 × 0.1 = 49.9 Ω.</li>
<li><strong>0, 00, 000</strong>: zero-ohm jumper.</li>
</ul>
<p>The marking does not state the tolerance; the format only suggests it. Very small parts (0201, 01005) are usually not marked at all.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Colours drift with age and heat; a burnt or faded resistor is best measured (out of circuit).</li>
<li>Some military and high-voltage parts use other conventions (for example a 5th band for reliability level, or yellow/grey in place of gold/silver to avoid metallic paint).</li>
<li>The TCR band gives the change of resistance with temperature: 100 ppm/K is 1 % over 100 K.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>IEC 60062:2016, <em>Marking codes for resistors and capacitors</em>, International Electrotechnical Commission (colour code, letter codes for tolerance and TCR, three- and four-character markings).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em> (E6 … E192).</li>
<li>EIA-96 / ECIA marking code for 1 % chip resistors, as described in resistor makers’ marking guides (e.g. Vishay, Yageo).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, Appendix C (resistor types and the colour code).</li>
</ul>`,
    },
  ],
};
