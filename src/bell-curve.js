const svgNS = 'http://www.w3.org/2000/svg';

function validateParameters(mean, sigma) {
  if (!Number.isFinite(mean) || !Number.isFinite(sigma) || sigma <= 0
    || Math.abs(mean) > 1e6 || sigma > 1e6 || sigma < 1e-6) {
    throw new Error('Enter a mean between −1,000,000 and 1,000,000 and a standard deviation from 0.000001 to 1,000,000.');
  }
}

function formatTick(value) {
  if (Math.abs(value) < 1e-10) return '0';
  return Number(value.toPrecision(5)).toString();
}

function validateBounds(lower, upper) {
  if (lower === undefined && upper === undefined) return;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
    throw new Error('Enter both bounds as numbers, with the lower bound no greater than the upper bound.');
  }
}

function standardNormalCdf(z) {
  if (z >= 8) return 1;
  if (z <= -8) return 0;
  const value = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * value);
  const tail = Math.exp(-value * value / 2) / Math.sqrt(2 * Math.PI)
    * (0.319381530 * t - 0.356563782 * t ** 2 + 1.781477937 * t ** 3
      - 1.821255978 * t ** 4 + 1.330274429 * t ** 5);
  return z >= 0 ? 1 - tail : tail;
}

function areaPercent(mean, sigma, lower, upper) {
  const probability = standardNormalCdf((upper - mean) / sigma)
    - standardNormalCdf((lower - mean) / sigma);
  return (100 * Math.max(0, Math.min(1, probability))).toFixed(1);
}

export function makeBellCurve(mean, sigma, lower, upper) {
  validateParameters(mean, sigma);
  validateBounds(lower, upper);
  const shaded = lower !== undefined;
  const area = shaded ? areaPercent(mean, sigma, lower, upper) : null;

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('id', 'bell-curve-svg');
  svg.setAttribute('viewBox', '0 0 720 400');
  svg.setAttribute('width', '720');
  svg.setAttribute('height', '400');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Normal distribution with mean ${formatTick(mean)} and standard deviation ${formatTick(sigma)}${shaded ? `; shaded area from ${lower} to ${upper} is approximately ${area} percent` : ''}`);

  const left = 58;
  const right = 684;
  const baseline = 318;
  const peakHeight = 218;
  const plotWidth = right - left;
  const x = (z) => left + (z + 4) * plotWidth / 8;
  const y = (z) => baseline - peakHeight * Math.exp(-z * z / 2);
  const points = Array.from({ length: 161 }, (_, index) => {
    const z = -4 + index / 20;
    return `${index ? 'L' : 'M'} ${x(z).toFixed(2)} ${y(z).toFixed(2)}`;
  }).join(' ');
  const lowerZ = shaded ? (lower - mean) / sigma : 0;
  const upperZ = shaded ? (upper - mean) / sigma : 0;
  const from = Math.max(-4, lowerZ);
  const to = Math.min(4, upperZ);
  const shadeSegments = shaded && from < to ? Math.ceil((to - from) * 20) : 0;
  const shadePoints = shadeSegments
    ? Array.from({ length: shadeSegments + 1 }, (_, index) => from + index * (to - from) / shadeSegments)
    : [];
  const shadePath = shadePoints.length
    ? `M ${x(from)} ${baseline} L ${shadePoints.map((z) => `${x(z).toFixed(2)} ${y(z).toFixed(2)}`).join(' L ')} L ${x(to)} ${baseline} Z`
    : '';
  const edge = (z) => z >= -4 && z <= 4 && x(upperZ) - x(lowerZ) >= 3
    ? `<path d="M ${x(z).toFixed(2)} ${baseline} V ${y(z).toFixed(2)}" fill="none" stroke="#315f8d" stroke-width="1.5" stroke-dasharray="4 4"/>`
    : '';

  svg.innerHTML = `
    <rect width="720" height="400" fill="#ffffff"/>
    <text x="58" y="47" fill="#26312b" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">Normal distribution</text>
    <text x="684" y="45" text-anchor="end" fill="#4d5a53" font-family="Arial, Helvetica, sans-serif" font-size="15">μ = ${formatTick(mean)}   σ = ${formatTick(sigma)}</text>
    <path d="M ${left} ${baseline} ${points} L ${right} ${baseline} Z" fill="#dce9f4"/>
    ${shadePath ? `<path d="${shadePath}" fill="#abc9e3"/>` : ''}
    ${shaded ? `${edge(lowerZ)}${edge(upperZ)}` : ''}
    <path d="${points}" fill="none" stroke="#315f8d" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M ${left} ${baseline} H ${right}" stroke="#26312b" stroke-width="2"/>
    ${[-3, -2, -1, 0, 1, 2, 3].map((z) => `
      <path d="M ${x(z)} ${baseline} v 8" stroke="#26312b" stroke-width="2"/>
      <text x="${x(z)}" y="350" text-anchor="middle" fill="#26312b" font-family="Arial, Helvetica, sans-serif" font-size="14">${formatTick(mean + z * sigma)}</text>
    `).join('')}
    <text x="371" y="382" text-anchor="middle" fill="#4d5a53" font-family="Arial, Helvetica, sans-serif" font-size="14">Value</text>
    ${shaded ? `<text x="371" y="79" text-anchor="middle" fill="#315f8d" font-family="Arial, Helvetica, sans-serif" font-size="15">Area ≈ ${area}%</text>` : ''}
  `;
  return svg;
}

export function makeBellCurveLatex(mean, sigma, lower, upper) {
  validateParameters(mean, sigma);
  validateBounds(lower, upper);
  return `\\bellcurve{${mean}}{${sigma}}${lower === undefined ? '' : `[${lower},${upper}]`}`;
}
