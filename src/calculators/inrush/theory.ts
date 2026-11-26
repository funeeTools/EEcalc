import type { TheorySection } from '@/core/ui/theory';

export const theoryIntro = {
  title: 'Theory & equations',
  lead:
    'When a voltage is applied to a capacitor bank, the only things limiting current are the resistance and inductance of everything in between: source, leads, PCB copper, ESR and ESL. ' +
    'That path is a series $RLC$ circuit. With little damping it rings, so the capacitor voltage overshoots the applied voltage — up to $2\\times$ for a step into a linear capacitor.',
};

export const theorySections: TheorySection[] = [
  {
    title: 'The model',
    html: `
<p>The circuit is a shared <b>feed</b> (source R, damping R, connector, supply leads, main series trace) that splits into
<b>N capacitor groups</b>. Each group has its own branch trace plus a bank of capacitors in parallel, reduced to one
$C_k$, $\\text{ESR}_k$ and $\\text{ESL}_k$:</p>
$$R_k = R_{\\text{trace},k} + \\text{ESR}_k \\qquad L_k = L_{\\text{trace},k} + \\text{ESL}_k$$
<p>Groups do <i>not</i> share a capacitor node during the surge, so a local ceramic on a short stub can ring faster and higher than
bulk capacitance on a longer branch. With one group the circuit is an ordinary series RLC.</p>`,
  },
  {
    title: 'Series RLC step response',
    html: `
<p>For a step of $\\Delta V = V_s - V_0$ into series $R$, $L$, $C$:</p>
$$\\omega_0 = \\frac{1}{\\sqrt{LC}} \\qquad \\zeta = \\frac{R}{2}\\sqrt{\\frac{C}{L}} \\qquad Q = \\frac{1}{2\\zeta} \\qquad Z_0 = \\sqrt{\\frac{L}{C}}$$
<p>Underdamped ($\\zeta < 1$), with $\\alpha = R/2L$ and $\\omega_d = \\omega_0\\sqrt{1-\\zeta^2}$:</p>
$$i(t) = \\frac{\\Delta V}{\\omega_d L}\\, e^{-\\alpha t} \\sin\\omega_d t \\qquad v_C(t) = V_s - \\Delta V\\, e^{-\\alpha t}\\Big(\\cos\\omega_d t + \\tfrac{\\alpha}{\\omega_d}\\sin\\omega_d t\\Big)$$
<p>Peak current occurs at $t_I = \\arctan(\\omega_d/\\alpha)/\\omega_d$; with very little damping it approaches $I_{pk} \\approx \\Delta V / Z_0$.
The first voltage peak is at $t_V = \\pi/\\omega_d$:</p>
$$V_{pk} = V_0 + \\Delta V\\left(1 + e^{-\\pi\\zeta/\\sqrt{1-\\zeta^2}}\\right)$$
<p>Overdamped ($\\zeta > 1$) there is no overshoot; current peaks at $t = \\ln(s_2/s_1)/(s_1 - s_2)$ with
$s_{1,2} = -\\alpha \\pm \\sqrt{\\alpha^2 - \\omega_0^2}$.</p>`,
  },
  {
    title: 'Damping the ring',
    html: `
<p>Critical damping needs total loop resistance</p>
$$R_{\\text{crit}} = 2\\sqrt{\\frac{L}{C}} = 2 Z_0$$
<p>so the extra series resistor to add is roughly $R_{\\text{crit}} - R_{\\text{eq}}$. $\\zeta \\approx 0.7$ already limits overshoot to ~5%.
Other levers, in rough order of effect: a slower rise time (soft-start, hot-swap controller), precharge (reduces $\\Delta V$),
an NTC, more ESR (a bulk electrolytic in parallel with MLCCs adds damping), and only then less inductance.</p>
<p>Let-through energy for fuses and MOSFETs is the action integral, and the energy left in the capacitors is:</p>
$$I^2t = \\int_0^{T} i(t)^2\\, dt \\qquad E = \\tfrac{1}{2} C V_{pk}^2$$`,
  },
  {
    title: 'Several capacitor groups',
    html: `
<p>With a shared feed $(R_0, L_0)$ and branch currents $i_k$, Kirchhoff's voltage law around each branch gives a coupled system:</p>
$$L_0 \\sum_j \\frac{di_j}{dt} + L_k \\frac{di_k}{dt} = v_s(t) - R_0 \\sum_j i_j - R_k i_k - v_k \\qquad C_k(v_k)\\frac{dv_k}{dt} = i_k$$
<p>In matrix form $\\mathbf{M}\\,\\dot{\\mathbf i} = \\mathbf{r}$ with $\\mathbf M = L_0\\mathbf{1}\\mathbf{1}^T + \\operatorname{diag}(L_k)$, which is inverted
in closed form (Sherman–Morrison). The headline $\\zeta$ and $f_0$ use the common-mode equivalent:</p>
$$C_{eq} = \\sum C_k \\qquad L_{eq} = L_0 + \\Big(\\sum 1/L_k\\Big)^{-1} \\qquad R_{eq} = R_0 + \\Big(\\sum 1/R_k\\Big)^{-1}$$
<p>Groups can also ring against each other (differential mode, $L_a + L_b$ with $C_a$ and $C_b$ in series) — the simulation captures that, the equivalent does not.</p>`,
  },
  {
    title: 'Ceramic DC-bias model',
    html: `
<p>Class II/III ceramics (X5R, X7R, Y5V…) lose capacitance with DC bias. Datasheet curves are vendor specific, so the tool estimates
$C(V)$ from dielectric, case size and voltage rating via the <b>volumetric efficiency</b></p>
$$\\eta_V = \\frac{C_{\\text{nF}}\\, V_{\\text{rated}}}{L\\,W\\,T\\ [\\text{mm}^3]}$$
<p>High $\\eta_V$ means a thin dielectric and a steeper drop. The remaining fraction at rated voltage, $c_{min}$, is interpolated on
$\\log\\eta_V$ per dielectric, and the curve is a smooth logistic shape mapped to pass through 1 at 0 V and $c_{min}$ at $V_{rated}$:</p>
$$\\frac{C(V)}{C_0} = c_{min} + (1 - c_{min})\\frac{g(u) - g(1)}{1 - g(1)}, \\quad g(u) = \\frac{1}{1 + (u/0.55)^p}, \\quad u = \\frac{V}{V_{rated}}$$
<p>During the transient the solver uses the <i>differential</i> capacitance, $dv/dt = i / C(v)$. Because $C$ falls as $V$ rises, Class II parts can exceed
$2\\times$ the applied step. ESR is estimated as electrode resistance plus $\\text{DF}/(\\omega C)$ at the estimated ring frequency, and ESL from the case size.</p>`,
  },
  {
    title: 'Leads and PCB traces',
    html: `
<p><b>Lead pair</b> (go and return, radius $r$, centre spacing $s$, length $\\ell$), including internal inductance:</p>
$$L = \\frac{\\mu_0 \\ell}{\\pi}\\cosh^{-1}\\!\\frac{s}{2r} + \\frac{\\mu_0 \\ell}{4\\pi}$$
<p><b>Microstrip</b> (trace over a plane): Hammerstad–Wheeler $Z_0$ with Bahl–Garg thickness correction, then the lumped inductance of an electrically short line:</p>
$$L = Z_0\\, t_d = Z_0 \\frac{\\ell\\sqrt{\\varepsilon_{eff}}}{c}$$
<p><b>Isolated bar</b> (no plane, Grover): $L = 2\\times10^{-7}\\,\\ell\\left[\\ln\\frac{2\\ell}{w+t} + 0.5 + 0.2235\\frac{w+t}{\\ell}\\right]$.</p>
<p><b>Resistance</b> uses copper resistivity $\\rho(T) = 1.724\\times10^{-8}(1 + 0.00393(T-20))$ and skin depth at the estimated ring frequency,
$\\delta = \\sqrt{\\rho/(\\pi f \\mu_0)}$. Above it, current is assumed to flow in a skin of depth $\\delta$.</p>`,
  },
  {
    title: 'Numerical solver',
    html: `
<p>The waveform comes from an adaptive <b>Dormand–Prince 5(4)</b> integrator (the same family as MATLAB <code>ode45</code>) with error control on every
current and voltage, and a step cap of 1/30 of the fastest natural period so peaks are resolved. If the circuit is stiff (tiny $L$ with large $R$ over a long window),
it automatically switches to an L-stable <b>Rosenbrock 2(3)</b> method (<code>ode23s</code>).</p>
<p>The original desktop app used fixed-step RK4 with a step count capped at 120 000. If the simulated window was long compared with the fastest
ring (high-Q circuits, or ceramics whose C collapses under bias), the step became too coarse and the solution could blow up into spikes. Adaptive
stepping with error control avoids that blow-up. Very long windows (slow ramps, long impulses) are still limited by a step budget; if the solver
stops early the result is marked <b>INCOMPLETE</b> rather than PASS. Reported peaks are refined with a parabola through the samples around each extreme.</p>`,
  },
  {
    title: 'Assumptions & limits',
    html: `
<ul>
<li>Lumped model: wiring longer than about λ/10 at the ring frequency needs a transmission-line model (a warning appears, assuming a velocity factor of 0.5).</li>
<li>Surge waveforms are modelled as an ideal open-circuit voltage behind the source resistance. A real surge generator's internal storage capacitor sags into large (µF-range) loads, so stress on big capacitor banks is overstated.</li>
<li>The energy figure is ½·C·V² at each group's own peak, summed — not the stored energy at one instant, and only approximate for class II ceramics. Reverse voltage on polarised capacitors during a negative ring is not checked.</li>
<li>Not included: mutual inductance between parallel traces, connector pin maps, FET $C_{oss}$, source current limiting dynamics, and dielectric absorption.</li>
<li>Parallel banks with very different ESL (bulk + MLCC) can anti-resonate inside a group; the lumped group model averages that out.</li>
<li>Ceramic $C(V)$, ESR and ESL are estimates — use the vendor's DC-bias curve when it matters.</li>
<li>Results are engineering estimates, not a substitute for a surge-lab measurement.</li>
</ul>`,
  },
];
