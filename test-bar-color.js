#!/usr/bin/env node

// Tests for getBarColor gradient function.
// Run: node test-bar-color.js

// --- Extract the pure function (no browser API dependencies) ---

const GRADIENT_GREEN = [0x76, 0xAD, 0x2A];
const GRADIENT_YELLOW = [0xFA, 0xA7, 0x2A];
const GRADIENT_ORANGE = [0xE8, 0x62, 0x35];
const GRADIENT_RED = [0xE0, 0x43, 0x43];

const YELLOW_THRESHOLD = 1175;
const ORANGE_THRESHOLD = 2000;
const RED_THRESHOLD = 3600;
const GREEN_YELLOW_POWER = 0.4;

function getBarColor(partialSeconds, majorSeconds) {
  if (partialSeconds <= 0 && majorSeconds <= 0) return '#76AD2A';

  const weighted = partialSeconds * 0.3 + majorSeconds * 1.0;

  let r, g, b;
  if (weighted <= YELLOW_THRESHOLD) {
    const t = Math.pow(weighted / YELLOW_THRESHOLD, GREEN_YELLOW_POWER);
    r = GRADIENT_GREEN[0] + (GRADIENT_YELLOW[0] - GRADIENT_GREEN[0]) * t;
    g = GRADIENT_GREEN[1] + (GRADIENT_YELLOW[1] - GRADIENT_GREEN[1]) * t;
    b = GRADIENT_GREEN[2] + (GRADIENT_YELLOW[2] - GRADIENT_GREEN[2]) * t;
  } else if (weighted <= ORANGE_THRESHOLD) {
    const t = (weighted - YELLOW_THRESHOLD) / (ORANGE_THRESHOLD - YELLOW_THRESHOLD);
    r = GRADIENT_YELLOW[0] + (GRADIENT_ORANGE[0] - GRADIENT_YELLOW[0]) * t;
    g = GRADIENT_YELLOW[1] + (GRADIENT_ORANGE[1] - GRADIENT_YELLOW[1]) * t;
    b = GRADIENT_YELLOW[2] + (GRADIENT_ORANGE[2] - GRADIENT_YELLOW[2]) * t;
  } else if (weighted <= RED_THRESHOLD) {
    const t = (weighted - ORANGE_THRESHOLD) / (RED_THRESHOLD - ORANGE_THRESHOLD);
    r = GRADIENT_ORANGE[0] + (GRADIENT_RED[0] - GRADIENT_ORANGE[0]) * t;
    g = GRADIENT_ORANGE[1] + (GRADIENT_RED[1] - GRADIENT_ORANGE[1]) * t;
    b = GRADIENT_ORANGE[2] + (GRADIENT_RED[2] - GRADIENT_ORANGE[2]) * t;
  } else {
    return '#E04343';
  }

  return '#' +
    Math.round(Math.max(0, Math.min(255, r))).toString(16).padStart(2, '0') +
    Math.round(Math.max(0, Math.min(255, g))).toString(16).padStart(2, '0') +
    Math.round(Math.max(0, Math.min(255, b))).toString(16).padStart(2, '0');
}

// --- Test helpers ---

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function colorDistance(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1.toLowerCase());
  const [r2, g2, b2] = hexToRgb(hex2.toLowerCase());
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertColor(actual, expected, maxDist, label) {
  const dist = colorDistance(actual, expected);
  if (dist <= maxDist) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label} — expected ${expected}, got ${actual} (distance ${dist.toFixed(1)}, max ${maxDist})`);
  }
}

// --- Tests ---

console.log('Test: Edge cases');
{
  assert(getBarColor(0, 0).toLowerCase() === '#76ad2a', 'zero outage returns green');
  assert(getBarColor(-1, 0).toLowerCase() === '#76ad2a', 'negative partial returns green');
  assert(getBarColor(0, -5).toLowerCase() === '#76ad2a', 'negative major returns green');
  assert(getBarColor(0, 100000).toLowerCase() === '#e04343', 'huge major outage returns red');
  assert(getBarColor(100000, 0).toLowerCase() === '#e04343', 'huge partial outage returns red');
  assert(getBarColor(50000, 50000).toLowerCase() === '#e04343', 'huge combined outage returns red');
}

console.log('Test: Gradient returns valid hex');
{
  for (const secs of [1, 100, 500, 1000, 3000, 5000, 10000, 50000]) {
    const c = getBarColor(secs, 0);
    assert(/^#[0-9a-fA-F]{6}$/.test(c), `valid hex for partial=${secs}: ${c}`);
  }
}

console.log('Test: Monotonic progression — more outage means color moves from green toward red');
{
  const partialValues = [0, 100, 500, 1000, 2000, 4000, 8000, 15000, 30000];
  for (let i = 0; i < partialValues.length - 1; i++) {
    const c1 = hexToRgb(getBarColor(partialValues[i], 0));
    const c2 = hexToRgb(getBarColor(partialValues[i + 1], 0));
    // Green channel should decrease or stay same as outage increases
    assert(c2[1] <= c1[1] + 1, `G channel decreases: partial ${partialValues[i]}→${partialValues[i + 1]}: G ${c1[1]}→${c2[1]}`);
  }
}

console.log('Test: Major outage weighs ~3.3x more than partial');
{
  // 1000s major should produce similar color to ~3333s partial
  const majorColor = getBarColor(0, 1000);
  const partialColor = getBarColor(3333, 0);
  const dist = colorDistance(majorColor, partialColor);
  assert(dist < 10, `1000s major ≈ 3333s partial (distance ${dist.toFixed(1)})`);
}

console.log('Test: Gradient stop colors are reached');
{
  // At yellow threshold, color should be close to yellow
  const atYellow = getBarColor(YELLOW_THRESHOLD / 0.3, 0);
  assertColor(atYellow, '#faa72a', 5, 'yellow stop');

  // At orange threshold, color should be close to orange
  const atOrange = getBarColor(ORANGE_THRESHOLD / 0.3, 0);
  assertColor(atOrange, '#e86235', 5, 'orange stop');

  // Past red threshold, color should be red
  const atRed = getBarColor(RED_THRESHOLD / 0.3 + 1000, 0);
  assert(atRed.toLowerCase() === '#e04343', `past red threshold returns exact red: ${atRed}`);
}

// All 27 non-green bars from status.claude.com (scraped 2026-04-11)
// Format: [partial_secs, major_secs, actual_fill_hex]
const STATUS_PAGE_BARS = [
  [7, 0, '#9dab2a'],         // Feb 1:  7s partial
  [695, 0, '#c3a92a'],       // Feb 18: 695s partial
  [1266, 0, '#cda92a'],      // Apr 10: 1266s partial
  [1322, 0, '#cea92a'],      // Feb 25: 1322s partial
  [0, 1392, '#f5952d'],      // Feb 3:  1392s major
  [2564, 0, '#e3a82a'],      // Jan 22: 2564s partial
  [2914, 0, '#e9a82a'],      // Mar 3:  2914s partial
  [2997, 0, '#eaa82a'],      // Feb 23: 2997s partial
  [0, 3846, '#e04343'],      // Apr 7:  3846s major → red
  [4060, 0, '#f9a42a'],      // Mar 31: 4060s partial
  [4103, 0, '#f9a32b'],      // Apr 3:  4103s partial
  [4583, 0, '#f6972d'],      // Feb 14: 4583s partial
  [4954, 0, '#f38d2e'],      // Apr 6:  4954s partial
  [5091, 0, '#f2892f'],      // Feb 4:  5091s partial
  [5095, 0, '#f2892f'],      // Mar 26: 5095s partial
  [5160, 0, '#f2882f'],      // Mar 12: 5160s partial
  [4310, 1008, '#e65c38'],   // Mar 19: mixed
  [5660, 0, '#ee7b31'],      // Apr 1:  5660s partial
  [5681, 0, '#ee7a31'],      // Mar 18: 5681s partial
  [5714, 0, '#ee7931'],      // Mar 21: 5714s partial
  [8948, 0, '#e5553b'],      // Mar 2:  8948s partial
  [9460, 0, '#e4523c'],      // Apr 8:  9460s partial
  [10218, 0, '#e34d3e'],     // Mar 13: 10218s partial
  [1300, 11972, '#e04343'],  // Jan 14: mixed → red
  [14940, 0, '#e04343'],     // Mar 17: 14940s partial → red
  [16920, 2520, '#e04343'],  // Mar 27: mixed → red
  [32160, 0, '#e04343'],     // Mar 25: 32160s partial → red
];

console.log(`Test: Match status.claude.com bars (${STATUS_PAGE_BARS.length} data points)`);
{
  let totalDist = 0;
  let maxDist = 0;
  let maxDistBar = null;

  for (const [p, m, expected] of STATUS_PAGE_BARS) {
    const actual = getBarColor(p, m);
    const dist = colorDistance(actual, expected);
    totalDist += dist;
    if (dist > maxDist) {
      maxDist = dist;
      maxDistBar = { p, m, expected, actual, dist };
    }
    // Small outages (<100s) have server-side rounding → allow 30
    // All others should be within 12 (visually indistinguishable)
    const maxAllowed = (p + m < 100) ? 30 : 12;
    assertColor(actual, expected, maxAllowed, `p=${p} m=${m}`);
  }

  const avgDist = totalDist / STATUS_PAGE_BARS.length;
  console.log(`  Average distance: ${avgDist.toFixed(1)} RGB units`);
  console.log(`  Worst match: p=${maxDistBar.p} m=${maxDistBar.m} expected=${maxDistBar.expected} got=${maxDistBar.actual} (${maxDistBar.dist.toFixed(1)})`);

  // Overall average should be under 6
  assert(avgDist < 6, `average distance ${avgDist.toFixed(1)} < 6`);
}

console.log('Test: Bars with >1000s outage within 5 RGB units');
{
  const strictBars = STATUS_PAGE_BARS.filter(([p, m]) => p + m >= 1000);
  let strictMax = 0;
  for (const [p, m, expected] of strictBars) {
    const actual = getBarColor(p, m);
    const dist = colorDistance(actual, expected);
    strictMax = Math.max(strictMax, dist);
    assertColor(actual, expected, 5, `strict p=${p} m=${m}`);
  }
  console.log(`  Worst strict match: ${strictMax.toFixed(1)} RGB units (${strictBars.length} bars)`);
}

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
