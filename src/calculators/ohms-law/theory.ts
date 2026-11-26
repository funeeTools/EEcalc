import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Ohm’s law — how this calculator works',
    lead:
      'A resistor ties voltage and current together through one number, its resistance, and turns the electrical power into heat. Give any two of $V$, $I$, $R$ and $P$ and the page finds the other two in closed form, then checks the dissipation and voltage against a real part and rounds $R$ to a standard value.',
  },
  sections: [
    {
      title: 'The two equations',
      html: `<p>For a linear resistor the current is proportional to the voltage across it (Ohm, 1827):</p>
$$V = I\\,R \\qquad\\Longleftrightarrow\\qquad I = \\frac{V}{R},\\quad R = \\frac{V}{I}$$
<p>The power delivered to it, all dissipated as heat (Joule’s law), is the product of voltage and current. Substituting Ohm’s law gives the two other forms:</p>
$$P = V\\,I = I^2R = \\frac{V^2}{R}$$
<p>Two equations in four quantities: any two fix the rest. The six cases on this page are</p>
<table><tr><th>Known</th><th>Computed</th></tr>
<tr><td>$V, I$</td><td>$R = V/I$, $P = VI$</td></tr>
<tr><td>$V, R$</td><td>$I = V/R$, $P = V^2/R$</td></tr>
<tr><td>$V, P$</td><td>$I = P/V$, $R = V^2/P$</td></tr>
<tr><td>$I, R$</td><td>$V = IR$, $P = I^2R$</td></tr>
<tr><td>$I, P$</td><td>$V = P/I$, $R = P/I^2$</td></tr>
<tr><td>$R, P$</td><td>$V = \\sqrt{PR}$, $I = \\sqrt{P/R}$</td></tr></table>
<p>$V$ and $I$ may be negative; with the passive sign convention they always share a sign, so $P \\ge 0$. A pair that implies an open circuit ($I = 0$ with $V \\ne 0$), a short ($V = 0$ with $I \\ne 0$) or a resistor that delivers power ($V$ and $I$ of opposite sign) has no answer, and the page says which.</p>
<p>The equations hold for DC and, with RMS values, for AC in a pure resistance. They assume the resistance does not depend on the operating point: a lamp filament, a heater or a diode has a different $V/I$ at every point, so the result describes only the point entered.</p>`,
    },
    {
      title: 'Which value is computed',
      html: `<p>The <em>Known values</em> menu picks the two inputs; the other two boxes turn green and are filled in. Clicking ◎ on a green box makes that value an input and keeps the input you chose most recently. Clicking ◎ on an input makes it computed and brings in the first computed value instead. Every case is a direct formula, so switching the known pair recomputes the same operating point.</p>`,
    },
    {
      title: 'Power and voltage ratings',
      html: `<p>A resistor’s rated dissipation $P_r$ is specified at 70 °C ambient (IEC 60115-1) and falls linearly to zero at the maximum film temperature, about 155 °C for thick-film chips. Its rated voltage follows from the power rating, capped by the limiting element voltage $U_{max}$ of the package:</p>
$$U_r = \\min\\left(\\sqrt{P_r R},\\; U_{max}\\right),\\qquad R_{crit} = \\frac{U_{max}^2}{P_r}$$
<p>Below the critical resistance the power rating limits the voltage; above it the voltage limit does. A 1 MΩ 0805 chip (1/8 W, 150 V) is limited to 150 V even though $\\sqrt{0.125 \\cdot 10^6} = 354$ V.</p>
<p>The page flags a part above 100 % of its rating in red and above 50 % in yellow. Running at about half the rating is common practice: it keeps the part cooler, slows drift and leaves room for hot ambients. The automatic pick is the smallest chip from 0402 to 2512 that meets both limits at ≤ 50 % load, then the smallest leaded power rating. Leaded parts are checked for power only, because their voltage limits vary by series.</p>`,
    },
    {
      title: 'Standard values and tolerance',
      html: `<p>The nearest IEC 60063 preferred value is the one closest on a logarithmic scale. The table lists it with the values just below and above, and shows what each does to the current and power. It holds fixed the source that drives the resistor: the voltage when $V$ is one of the inputs (or when $R$ and $P$ are given), otherwise the current.</p>
<p>A tolerance $\\pm t$ moves $R$ between $R(1-t)$ and $R(1+t)$. At fixed voltage the power is highest at the low end, $P_{max} = V^2/\\big(R(1-t)\\big)$. At fixed current it is highest at the high end, $P_{max} = I^2R(1+t)$.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Self-heating.</strong> A part at full rating runs about 85 °C above ambient. The resistance changes with the TCR (±100 ppm/K for common thick film, ±25 ppm/K or better for thin film).</li>
<li><strong>Low values.</strong> Below about 0.1 Ω, traces, solder joints and contacts add milliohms. Current shunts use four-terminal (Kelvin) connections.</li>
<li><strong>High values.</strong> Above about 100 MΩ, board leakage, humidity and meter input resistance (10 MΩ for most multimeters) become comparable to $R$.</li>
<li><strong>Pulses.</strong> The ratings here are for continuous power. Short pulses can exceed them by a wide margin; use the datasheet’s pulse-load curve.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>G. S. Ohm, <em>Die galvanische Kette, mathematisch bearbeitet</em>, Berlin, 1827.</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.2.1–1.2.2 (Ohm’s law, power in resistors).</li>
<li>IEC 60115-1:2020, <em>Fixed resistors for use in electronic equipment — Part 1: Generic specification</em> (rated dissipation, rated voltage, limiting element voltage, critical resistance).</li>
<li>Vishay Draloric, <em>D/CRCW e3 Standard Thick Film Chip Resistors</em>, document 20035 (ratings by size).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
