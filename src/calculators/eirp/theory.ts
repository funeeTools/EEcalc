import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'EIRP and ERP — how this calculator works',
    lead:
      'EIRP is the power an isotropic antenna would need to produce the same field as your transmitter, cable and antenna in their strongest direction. ERP is the same thing referred to a half-wave dipole. This page adds up the chain in decibels, converts between dBm, dBW and watts, solves for the transmit power, antenna gain or cable loss that meets a target, and checks the result against FCC 47 CFR 15.247, ETSI EN 300 328 or a limit you enter.',
  },
  sections: [
    {
      title: 'The chain in decibels',
      html: `<p>Power in dBm is $10\\log_{10}(P/1\\,\\text{mW})$, so 0 dBm = 1 mW, 30 dBm = 1 W and dBW = dBm − 30. Gains and losses then add:</p>
$$\\text{EIRP} = P_t - L_c - L_o + G_i \\quad [\\text{dBm}]$$
<p>Here $P_t$ is the transmitter’s conducted output, $L_c$ the cable loss, $L_o$ the connector, arrestor, filter or mismatch losses, and $G_i$ the antenna gain in dBi in the direction of interest. Effective radiated power is referred to a half-wave dipole, whose gain over isotropic is $1.64 = 2.15$ dBi:</p>
$$\\text{ERP} = \\text{EIRP} - 2.15\\ \\text{dB},\\qquad G_{dBd} = G_{dBi} - 2.15$$
<p>The ITU Radio Regulations (Article 1, terms and definitions) define e.i.r.p. against an isotropic antenna and e.r.p. against a half-wave dipole.</p>`,
    },
    {
      title: 'Solving for one unknown',
      html: `<p>Every term enters the sum linearly, so each inverse is exact. The <strong>transmit power</strong> for a target EIRP is $P_t = \\text{EIRP} + L_c + L_o - G_i$. The <strong>antenna gain</strong> is $G_i = \\text{EIRP} - P_t + L_c + L_o$. The <strong>cable loss</strong> (or the attenuator to add) is $L_c = P_t - L_o + G_i - \\text{EIRP}$; it must come out positive, because a passive feed cannot add power. Independently of the solve, the page reports the largest transmit power and the largest antenna gain the selected limit allows.</p>`,
    },
    {
      title: 'FCC 47 CFR 15.247 (902–928, 2400–2483.5, 5725–5850 MHz)',
      html: `<p>For digitally modulated systems, paragraph (b)(3) sets the maximum conducted output power at 1 W (30 dBm). Paragraph (b)(4) says this limit assumes antennas with a directional gain of at most 6 dBi. Above that, the conducted power must be reduced by the amount in dB by which the gain exceeds 6 dBi. That caps an ordinary system at 36 dBm EIRP. Two exceptions apply to <em>exclusively fixed point-to-point</em> links (§15.247(c)(1)):</p>
<ul>
<li>2400–2483.5 MHz: reduce the conducted power by only 1 dB for every 3 dB of gain above 6 dBi, (c)(1)(i).</li>
<li>5725–5850 MHz: no reduction at all, (c)(1)(ii).</li>
</ul>
<p>Point-to-multipoint, omnidirectional and multiple co-located radiators are excluded from this relief, (c)(1)(iii). The 1 W limit also covers frequency hopping with at least 75 channels at 2.4 GHz, all frequency hopping at 5.8 GHz, (b)(1), and at least 50 channels at 902–928 MHz, (b)(2). Frequency-hopping systems in the 2.4 GHz band with fewer than 75 hopping channels are limited to 0.125 W, (b)(1). At 902–928 MHz, 25–49 channels are allowed 0.25 W, (b)(2). The (c)(1)(i) point-to-point relief applies to the 2.4 GHz 0.125 W case too. The FCC limits are on <em>conducted</em> power, so the page compares them with $P_t$ as entered and gives no credit for cable loss, which is the conservative reading. The first graph translates the rule into the EIRP ceiling it implies for each antenna gain.</p>`,
    },
    {
      title: 'ETSI EN 300 328 (2.4 GHz)',
      html: `<p>In Europe, wideband data equipment in 2400–2483.5 MHz falls under ETSI EN 300 328 (V2.2.2). The standard defines RF output power as the mean e.i.r.p. during a transmission burst and limits it to 20 dBm (100 mW), both for frequency-hopping equipment (§4.3.1.2.3) and for other wideband modulations (§4.3.2.2.3). The limit includes the antenna, so a higher-gain antenna needs a matching drop in transmit power. Equipment other than frequency hopping must also keep its power spectral density at or below 10 dBm per MHz e.i.r.p. (§4.3.2.3.3). For a flat spectrum of occupied bandwidth $B$ this caps the e.i.r.p. at $10 + 10\\log_{10}(B/1\\,\\text{MHz})$ dBm, which binds for signals narrower than 10 MHz. Enter $B$ with the non-FHSS preset. Other bands and services, such as 868 MHz short-range devices (often specified in ERP) or 5 GHz WLAN, have their own rules: enter them as a user EIRP or ERP limit.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Use the antenna’s peak gain from its data sheet, at the operating frequency. Regulators assess the main beam.</li>
<li>Cable loss scales with length and rises with frequency. At 2.4 GHz, LMR-400-class cable loses about 0.22 dB/m and RG-58 about 0.8 dB/m; check the maker’s table.</li>
<li>A transmitter that is over the limit can be brought back with a lower power setting, a lower-gain antenna or an attenuator. Solve for the cable loss to size the pad.</li>
<li>Rules also limit power spectral density, out-of-band emissions and, in some bands, duty cycle. This page checks only the power limit you select.</li>
<li>This page is an engineering aid, not legal advice. Check the current rule text and your equipment authorisation.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>47 CFR §15.247, <em>Operation within the bands 902–928 MHz, 2400–2483.5 MHz, and 5725–5850 MHz</em>, paragraphs (b)(1)–(b)(4) and (c)(1)(i)–(iii) (Electronic Code of Federal Regulations, current edition).</li>
<li>ETSI EN 300 328 V2.2.2 (2019-07), <em>Wideband transmission systems; Data transmission equipment operating in the 2,4 GHz band</em>, §4.3.1.2, §4.3.2.2 and §4.3.2.3.</li>
<li>ITU Radio Regulations, Article 1, terms and definitions (equivalent isotropically radiated power, effective radiated power).</li>
<li>C. A. Balanis, <em>Antenna Theory: Analysis and Design</em>, 3rd ed., Wiley, 2005, §4.6 (half-wave dipole, $D_0 = 1.643$ = 2.15 dBi).</li>
</ul>`,
    },
  ],
};
