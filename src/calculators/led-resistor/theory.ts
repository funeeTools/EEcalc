import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'LED series resistors — how this calculator works',
    lead:
      'An LED is a diode. Once it conducts, its voltage barely changes while its current changes a lot, so it must not be connected straight across a voltage source. The simplest current limit is a resistor in series. This page sizes that resistor for one or more LEDs in series, picks a standard value, and shows how the current moves with the supply and with part-to-part differences in forward voltage.',
  },
  sections: [
    {
      title: 'The equation',
      html: `<p>Treat each conducting LED as a fixed voltage drop $V_F$. With $n$ LEDs in series, Kirchhoff’s voltage law around the loop gives</p>
$$V_s = n\\,V_F + I_F R$$
$$R = \\frac{V_s - nV_F}{I_F},\\qquad I_F = \\frac{V_s - nV_F}{R},\\qquad V_s = nV_F + I_FR$$
<p>The resistor dissipates $P_R = I_F^2R$, each LED $P_{LED} = V_FI_F$, and the fraction of supply power that reaches the LEDs is</p>
$$\\eta = \\frac{nV_F}{V_s}$$
<p>When solving for $R$, the page also picks the next standard value <em>up</em> from the exact answer. The current then stays at or just below the target. All later results use that standard resistor.</p>`,
    },
    {
      title: 'Headroom and sensitivity',
      html: `<p>The resistor sets the current only through the voltage left across it, the headroom $V_R = V_s - nV_F$. A change $\\Delta V_F$ in each LED’s forward voltage shifts the current by</p>
$$\\frac{\\Delta I_F}{I_F} = -\\frac{n\\,\\Delta V_F}{V_s - nV_F}$$
<p>With 3 V of headroom, a 0.1 V shift moves the current about 3 %. With 0.5 V of headroom it moves 20 %. Datasheets give a typical and a maximum $V_F$ (for InGaN blue and white parts, 3.3 V typical and 4.0 V maximum is common), so a string designed for typical parts can come out much dimmer. It may not light at all if the supply is below $nV_{F,max}$. The page shows the current at both values, and the second graph plots the whole spread. A rule of thumb: keep at least 20–30 % of the supply across the resistor, or use a constant-current driver.</p>`,
    },
    {
      title: 'Forward-voltage presets',
      html: `<p>The colour presets (labelled by dominant wavelength; peak wavelength for the infrared part) are typical and maximum values from Kingbright’s WP7113 series of 5 mm through-hole LEDs, measured at the datasheet test current (10 mA or 20 mA). The main split is between materials:</p>
<ul>
<li>GaAsP / GaP / AlGaInP (red, orange, yellow, yellow-green): about 1.8–2.2 V.</li>
<li>InGaN (true green, blue, white): about 2.8–3.6 V.</li>
<li>GaAs / GaAlAs infrared: about 1.2–1.6 V.</li>
</ul>
<p>Other makers, packages and brightness bins differ by a few hundred millivolts. Use the datasheet of the actual part when you have it.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Indicator current.</strong> Modern high-efficiency LEDs are clearly visible at 1–5 mA. Running at the 20 mA test current is rarely needed and wastes power.</li>
<li><strong>One resistor per string.</strong> LEDs in parallel on a single resistor share current badly: the one with the lowest $V_F$ takes most of it and heats up, which lowers its $V_F$ further.</li>
<li><strong>Temperature.</strong> $V_F$ falls by roughly 1.5–2.5 mV/K, so a warm LED draws slightly more current. The absolute maximum current is derated above about 25–50 °C ambient (see the datasheet derating curve).</li>
<li><strong>GPIO drive.</strong> A microcontroller pin is not an ideal source. Its output voltage sags by tens to hundreds of mV at a few mA, which acts like extra series resistance. Check the pin’s $V_{OH}$/$V_{OL}$ at the load current.</li>
<li><strong>Power LEDs and long strings.</strong> Above a few tens of mA, or when the headroom is small, a constant-current regulator or switching LED driver is more efficient and much less sensitive to $V_F$.</li>
<li><strong>Reverse voltage.</strong> LEDs typically withstand only 5 V reverse. On AC or reversible supplies add an antiparallel diode.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015: ch. 1 (diodes) and ch. 12 (LED indicators and drive).</li>
<li>Kingbright, WP7113 series 5 mm LED lamp datasheets: WP7113ID (DSAF0012), WP7113SURCK (DSAF6186), WP7113YD (DSAF2448), WP7113GD (DSAE9335), WP7113ZGC (DSAF0944), WP7113QBC/D (DSAG3481), WP7113QWC/D (DSAI6407), WP7113SF4C (DSAF2423): forward voltage and absolute maximum ratings.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
