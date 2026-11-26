import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Resistors in series and parallel — how this calculator works',
    lead:
      'Resistors chained end to end share one current; resistors across the same two nodes share one voltage. From those two facts follow the equivalent resistance, how voltage, current and power divide among the parts, and how the part tolerances add up. The page also solves for the one resistor that gives a target value, and rounds it to a standard part.',
  },
  sections: [
    {
      title: 'Equivalent resistance',
      html: `<p><strong>Series.</strong> One current $I$ flows through every resistor, and the voltages add (Kirchhoff’s voltage law):</p>
$$R_{eq} = R_1 + R_2 + \\dots + R_n,\\qquad V_i = I\\,R_i$$
<p><strong>Parallel.</strong> One voltage $V$ sits across every resistor, and the currents add (Kirchhoff’s current law), so conductances add:</p>
$$\\frac{1}{R_{eq}} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\dots + \\frac{1}{R_n},\\qquad I_i = \\frac{V}{R_i}$$
<p>For two resistors this is the familiar product over sum, $R_1R_2/(R_1+R_2)$. $n$ equal resistors give $nR$ in series and $R/n$ in parallel. A series chain is always larger than its largest part; a parallel group is always smaller than its smallest part.</p>
<p>Each part dissipates $P_i = V_iI_i$. In series the largest resistor takes the most power; in parallel the smallest does.</p>`,
    },
    {
      title: 'Solving for one resistor',
      html: `<p>Click ◎ on a resistor and enter the target $R_{eq}$. With the other resistors fixed, the inverse is exact:</p>
$$\\text{series: } R_k = R_{eq} - \\sum_{j\\ne k} R_j \\qquad\\text{parallel: } \\frac{1}{R_k} = \\frac{1}{R_{eq}} - \\sum_{j\\ne k}\\frac{1}{R_j}$$
<p>A series target below the sum of the others, or a parallel target above the parallel value of the others, has no positive answer, and the page says which limit applies. The exact value is then rounded to the IEC 60063 values just below and above, with the $R_{eq}$ each one gives.</p>
<p>Adding a large resistor in parallel, or a small one in series, is a common way to trim a standard value. The first graph shows how flat $R_{eq}$ becomes once the trimming part is far from the others.</p>`,
    },
    {
      title: 'Tolerance',
      html: `<p>$R_{eq}$ rises with every $R_i$, and scaling all parts by the same factor scales $R_{eq}$ by it. So the worst case is all parts at their low limit or all at their high limit:</p>
$$R_{eq,min} = R_{eq}\\big(R_i(1-t_i)\\big),\\qquad R_{eq,max} = R_{eq}\\big(R_i(1+t_i)\\big)$$
<p>With equal tolerances the network has exactly the tolerance of its parts: putting 1 % resistors in series or parallel does not make a 1 % worst case any better. Independent errors do partly cancel, though. The log sensitivities are $S_i = R_i/R_{eq}$ in series and $S_i = R_{eq}/R_i$ in parallel (both sum to 1), and the RSS spread is</p>
$$\\frac{\\sigma_{R_{eq}}}{R_{eq}} \\approx \\sqrt{\\sum_i (S_i t_i)^2}$$
<p>For $n$ equal parts this is $t/\\sqrt n$. Parts from one reel tend to err together, so the real spread lies between RSS and the worst case.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>High voltage.</strong> A series string spreads the voltage: four 1 MΩ chips across 1 kV see 250 V each, within a 2010 chip’s 400 V limit but not an 0805’s 150 V. The table shows the smallest chip that meets both the power (2× margin) and the voltage limit.</li>
<li><strong>Current sharing.</strong> Parallel shunts share current in proportion to conductance, but trace and solder resistance (milliohms) is in series with each. Lay them out symmetrically and sense with Kelvin connections.</li>
<li><strong>Mixed networks.</strong> Reduce a series-parallel network one group at a time: work out a parallel group, then enter its value as one resistor in the series chain.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.2.2 (resistors in series and parallel).</li>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, §2.5–2.6 (series resistors and voltage division; parallel resistors and current division).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
<li>Vishay Draloric, <em>D/CRCW e3 Standard Thick Film Chip Resistors</em>, document 20035 (rated power and limiting element voltage by size).</li>
</ul>`,
    },
  ],
};
