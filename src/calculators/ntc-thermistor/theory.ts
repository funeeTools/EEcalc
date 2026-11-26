import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'NTC thermistors — how this calculator works',
    lead:
      'An NTC thermistor is a ceramic resistor whose resistance falls steeply and non-linearly with temperature, by roughly 4 % per kelvin near room temperature. This page converts between temperature, resistance and the voltage of a divider read by an ADC, using either the two-parameter β model or the three-parameter Steinhart–Hart equation (with coefficients given or fitted to three points). It also chooses the divider resistor for a temperature range and estimates the self-heating error.',
  },
  sections: [
    {
      title: 'The β (B-value) model',
      html: `<p>Over a limited range the resistance follows an Arrhenius-like law:</p>
$$R(T) = R_0\\,\\exp\\!\\left[\\beta\\left(\\frac1T - \\frac1{T_0}\\right)\\right],\\qquad T = \\left[\\frac1{T_0} + \\frac{\\ln(R/R_0)}{\\beta}\\right]^{-1}$$
<p>with $T$ in kelvin, $R_0$ the resistance at $T_0$ (usually 25 °C) and $\\beta$ the material constant. Data sheets quote β between two temperatures, e.g. $B_{25/85} = \\ln(R_{25}/R_{85}) / (1/T_{25} - 1/T_{85})$. The model is exact at those two temperatures and drifts away elsewhere, because the real $\\ln R$ is not exactly linear in $1/T$: for a typical 10 kΩ part described by $B_{25/85}$ the error stays below 1 K from 0 to 100 °C but reaches 2–3 K at −40 °C or 150 °C. The temperature coefficient is $\\alpha = \\frac1R\\frac{dR}{dT} = -\\beta/T^2$ — about −4.4 %/K for β = 3950 K at 25 °C.</p>`,
    },
    {
      title: 'Steinhart–Hart equation',
      html: `<p>Steinhart and Hart (1968) showed that a cubic in $\\ln R$ fits thermistor curves far better than the β model — typically within about ±0.01–0.02 K over a 100 K span:</p>
$$\\frac1T = A + B\\ln R + C(\\ln R)^3.$$
<p>Temperature from resistance is direct. Resistance from temperature needs the root of the cubic $C x^3 + Bx + (A - 1/T) = 0$ with $x = \\ln R$, which Cardano’s formula gives in closed form:</p>
$$x = \\sqrt[3]{-\\tfrac q2 + \\sqrt{\\tfrac{q^2}4 + \\tfrac{p^3}{27}}} + \\sqrt[3]{-\\tfrac q2 - \\sqrt{\\tfrac{q^2}4 + \\tfrac{p^3}{27}}},\\qquad p = \\frac BC,\\ q = \\frac{A - 1/T}{C}.$$
<p><strong>Fitting from three points.</strong> With $L_i = \\ln R_i$ and $Y_i = 1/T_i$, the three equations are linear in A, B, C and solve as</p>
$$\\gamma_2 = \\frac{Y_2 - Y_1}{L_2 - L_1},\\ \\gamma_3 = \\frac{Y_3 - Y_1}{L_3 - L_1},\\ C = \\frac{\\gamma_3 - \\gamma_2}{(L_3 - L_2)(L_1 + L_2 + L_3)},\\ B = \\gamma_2 - C(L_1^2 + L_1L_2 + L_2^2),\\ A = Y_1 - (B + CL_1^2)L_1.$$
<p>Choose the points at the ends and the middle of the range you care about; outside them the fit extrapolates and the page warns. Inconsistent points can give $C < 0$; the curve then turns back at $\\ln R_t = \\sqrt{-B/3C}$ and describes nothing below the corresponding temperature, which the page reports.</p>`,
    },
    {
      title: 'Divider readout',
      html: `<p>With the thermistor from the output to ground and $R_S$ to the supply, $V_{out} = V_S\\,R_T/(R_T + R_S)$ (falls with temperature); with the thermistor on top, $V_{out} = V_S\\,R_S/(R_T + R_S)$ (rises). Solving for the thermistor gives $R_T = R_S V_{out}/(V_S - V_{out})$ or $R_S(V_S - V_{out})/V_{out}$, and the model then gives the temperature — which is what the “from V_out” option does. If the ADC reference is the divider supply, the reading is ratiometric: the code $N = 2^n V_{out}/V_S$ does not depend on $V_S$ at all.</p>
<p>The sensitivity is $dV/dT = \\pm V_S\\,\\dfrac{R_S R_T}{(R_T + R_S)^2}\\,\\alpha$, largest where $R_T = R_S$; one ADC step corresponds to $\\Delta T = (V_S/2^n)/|dV/dT|$.</p>`,
    },
    {
      title: 'Choosing the series resistor',
      html: `<p><strong>Largest swing.</strong> The voltage change between the range ends $T_{lo}$ and $T_{hi}$ is $V_S\\left[\\frac{R_{lo}}{R_{lo} + R_S} - \\frac{R_{hi}}{R_{hi} + R_S}\\right]$. Setting its derivative with respect to $R_S$ to zero gives</p>
$$R_S = \\sqrt{R_{lo}\\,R_{hi}},$$
<p>the geometric mean of the thermistor resistance at the two ends. This maximises the average volts per kelvin over the range.</p>
<p><strong>Best linearity.</strong> Writing $u = \\ln R_T$, $V''(T) = 0$ at mid-range $T_m$ requires $(s-1)/(s+1) = -u''/u'^2$ with $s = R_S/R_T(T_m)$. For the β model ($u' = -\\beta/T^2$, $u'' = 2\\beta/T^3$) this becomes</p>
$$R_S = R_T(T_m)\\,\\frac{\\beta - 2T_m}{\\beta + 2T_m},$$
<p>which places the inflection of the S-shaped $V(T)$ curve at $T_m$, so the output is straightest there. The Tables tab compares these choices (and $R_S = R_T(T_m)$) by swing and by the worst deviation from a straight line, expressed in kelvin.</p>`,
    },
    {
      title: 'Self-heating',
      html: `<p>The divider current heats the thermistor above its surroundings by</p>
$$\\Delta T = \\frac{P}{\\delta},\\qquad P = \\frac{V_S^2\\,R_T}{(R_T + R_S)^2}$$
<p>where δ is the dissipation constant (mW/K) from the data sheet, defined in IEC 60539-1 and quoted in still air; it is higher in moving air or when the part is bonded to what it measures. $P$ is largest when $R_T = R_S$, at $V_S^2/4R_S$. For 0.1 K accuracy the thermistor power usually has to stay in the tens of microwatts: use a higher-resistance part and $R_S$, a lower $V_S$, or switch the divider on only while sampling.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Use the data-sheet table for accuracy.</strong> Fit Steinhart–Hart to the manufacturer’s R–T table, or better, to your own calibration points.</li>
<li><strong>Tolerances add.</strong> An NTC’s R₂₅ tolerance (±1–5 %) and β tolerance, plus the series resistor’s tolerance, each shift the reading by about $\\Delta R/R/|\\alpha|$ — a 1 % error is roughly 0.25 K near 25 °C.</li>
<li><strong>Filter the ADC input.</strong> A capacitor (10–100 nF) at the ADC pin supplies the sampling charge; with tens of kΩ of source resistance the sample-and-hold may otherwise not settle.</li>
<li><strong>Thermal contact.</strong> The sensor reads its own temperature. Lead conduction and air gaps add errors that no formula fixes.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>J. S. Steinhart, S. R. Hart, “Calibration curves for thermistors,” <em>Deep-Sea Research and Oceanographic Abstracts</em> 15(4), 1968, pp. 497–503.</li>
<li>IEC 60539-1:2016, <em>Directly heated negative temperature coefficient thermistors — Part 1: Generic specification</em> (B-value, dissipation constant).</li>
<li>J. Fraden, <em>Handbook of Modern Sensors</em>, 5th ed., Springer, 2016, chapter “Temperature Sensors” (thermistors, β and Steinhart–Hart models, self-heating).</li>
<li>Coefficients A = 1.129148×10⁻³, B = 2.34125×10⁻⁴, C = 8.76741×10⁻⁸: the widely published Steinhart–Hart set for the 10 kΩ “44006” curve (R = 32.65 kΩ at 0 °C, 10.00 kΩ at 25 °C).</li>
</ul>`,
    },
  ],
};
