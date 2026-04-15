const CLAUDE_CODE_ID = 'yyzkbfz2thpt';
const API_BASE = 'https://status.claude.com/api/v2';
const POLL_INTERVAL_MINUTES = 0.5; // 30 seconds (clamped to 1 min for published extensions)

const STATUS_SEVERITY = {
  operational: 0,
  degraded_performance: 1,
  partial_outage: 2,
  major_outage: 3,
};

// 11 rays at even 32.7° intervals, alternating lengths — Keep in sync with popup.js
const SPARK_RAYS = (() => {
  const step = 360 / 11;
  const lengths = [1.0, 0.88, 1.0, 0.88, 1.0, 0.88, 1.0, 0.88, 1.0, 0.88, 1.0];
  return lengths.map((len, i) => ({ angle: -90 + i * step, length: len }));
})();

// EKG heartbeat path points (normalized to 0-1 range, centered at 0.5)
const EKG_POINTS = [
  [0.071, 0.5], [0.25, 0.5], [0.304, 0.457],
  [0.357, 0.5], [0.411, 0.5], [0.446, 0.286],
  [0.536, 0.643], [0.607, 0.5], [0.679, 0.5],
  [0.732, 0.446], [0.804, 0.5], [0.929, 0.5],
];

const STATUS_COLORS = {
  operational: '#76AD2A',
  degraded_performance: '#D4A017',
  partial_outage: '#E86235',
  major_outage: '#E04343',
};

// Gradient colors from status.claude.com (window.pageColorData)
const GRADIENT_GREEN = [0x76, 0xAD, 0x2A];
const GRADIENT_YELLOW = [0xFA, 0xA7, 0x2A];
const GRADIENT_ORANGE = [0xE8, 0x62, 0x35];
const GRADIENT_RED = [0xE0, 0x43, 0x43];

// Gradient stops in weighted seconds (partial*0.3 + major*1.0)
const YELLOW_THRESHOLD = 1175;
const ORANGE_THRESHOLD = 2000;
const RED_THRESHOLD = 3600;
const GREEN_YELLOW_POWER = 0.4;

// Compute bar color matching status.claude.com's gradient.
// Inputs: partial outage seconds, major outage seconds for a day.
// Returns hex color string.
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

async function updateIcon(status) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.operational;
  const sizes = [16, 32, 48, 128];
  const imageData = {};

  for (const size of sizes) {
    imageData[size] = renderSparkIcon(size, color);
  }

  chrome.action.setIcon({ imageData });
}

function renderSparkIcon(size, color) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.48;
  const rayWidth = Math.max(2.2, size * 0.09);
  const scale = size / 28; // EKG points are normalized to 28x28 viewBox

  // 1. Draw rays
  ctx.strokeStyle = color;
  ctx.lineWidth = rayWidth;
  ctx.lineCap = 'round';

  for (const ray of SPARK_RAYS) {
    const radians = (ray.angle * Math.PI) / 180;
    const len = maxRadius * ray.length;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(radians) * len, cy + Math.sin(radians) * len);
    ctx.stroke();
  }

  function traceEkgPath() {
    ctx.beginPath();
    for (let i = 0; i < EKG_POINTS.length; i++) {
      const x = EKG_POINTS[i][0] * size;
      const y = EKG_POINTS[i][1] * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  // 2. Knockout gap — erase along EKG path
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 4.0 * scale;
  ctx.lineJoin = 'round';
  traceEkgPath();
  ctx.stroke();

  // 3. Draw EKG pulse on top
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.8 * scale;
  traceEkgPath();
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  return ctx.getImageData(0, 0, size, size);
}

let lastPayloadHash = '';

async function pollStatus() {
  try {
    const [summaryRes, incidentsRes] = await Promise.all([
      fetch(`${API_BASE}/summary.json`),
      fetch(`${API_BASE}/incidents.json`),
    ]);

    if (!summaryRes.ok || !incidentsRes.ok) {
      console.error('Status API fetch failed:', summaryRes.status, incidentsRes.status);
      return;
    }

    const summary = await summaryRes.json();
    const incidents = await incidentsRes.json();

    const components = summary.components || [];
    const claudeCode = components.find((c) => c.id === CLAUDE_CODE_ID);
    const currentStatus = claudeCode ? claudeCode.status : 'operational';

    const otherServices = components
      .filter((c) => c.id !== CLAUDE_CODE_ID && c.showcase && !c.group)
      .map((c) => ({ id: c.id, name: c.name, status: c.status }));

    const sevenDayHistory = buildSevenDayHistory(incidents.incidents || [], currentStatus);

    const recentIncidents = getRecentIncidents(incidents.incidents || []);

    const payload = { currentStatus, otherServices, sevenDayHistory, recentIncidents };
    const payloadHash = JSON.stringify(payload);

    if (payloadHash !== lastPayloadHash) {
      lastPayloadHash = payloadHash;
      await chrome.storage.local.set({ ...payload, lastUpdated: Date.now() });
      await updateIcon(currentStatus);
      const statusText = formatStatus(currentStatus);
      chrome.action.setTitle({ title: `Claude Code: ${statusText}` });
    }
  } catch (err) {
    console.error('Poll failed:', err);
  }
}

function buildSevenDayHistory(allIncidents, currentStatus) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    days.push({ date: dateStr, status: 'operational', incidents: [], outageSeconds: 0, partialSeconds: 0, majorSeconds: 0, rawSegments: [] });
  }

  for (const incident of allIncidents) {
    // Skip incidents that didn't affect Claude Code at all
    if (getWorstStatusFromIncident(incident) === 'operational') continue;

    const incStart = new Date(incident.started_at).getTime();
    const incEnd = incident.resolved_at
      ? new Date(incident.resolved_at).getTime()
      : now.getTime();

    // Get actual outage periods from component status transitions
    // Only partial_outage and major_outage count (not degraded_performance)
    const outagePeriods = getClaudeCodeOutagePeriods(incident);

    for (const dayEntry of days) {
      const dayStart = new Date(dayEntry.date + 'T00:00:00Z').getTime();
      const dayEnd = new Date(dayEntry.date + 'T23:59:59.999Z').getTime();

      // Add incident to "related" list if it overlaps this day
      if (incStart <= dayEnd && incEnd >= dayStart) {
        dayEntry.incidents.push(incident.name);
      }

      // Add outage periods that overlap with this day
      for (const period of outagePeriods) {
        const overlapStart = Math.max(dayStart, period.start);
        const overlapEnd = Math.min(dayEnd, period.end);

        if (overlapStart < overlapEnd) {
          if (STATUS_SEVERITY[period.status] > STATUS_SEVERITY[dayEntry.status]) {
            dayEntry.status = period.status;
          }

          const dayDuration = dayEnd - dayStart;
          dayEntry.rawSegments.push({
            start: (overlapStart - dayStart) / dayDuration,
            end: (overlapEnd - dayStart) / dayDuration,
            status: period.status,
          });
        }
      }
    }
  }

  for (const dayEntry of days) {
    dayEntry.segments = buildDaySegments(dayEntry.rawSegments);
    delete dayEntry.rawSegments;

    // Calculate partial/major seconds from merged segments
    dayEntry.partialSeconds = 0;
    dayEntry.majorSeconds = 0;
    for (const seg of dayEntry.segments) {
      if (seg.status === 'partial_outage') {
        dayEntry.partialSeconds += Math.round(seg.fraction * 86400);
      } else if (seg.status === 'major_outage') {
        dayEntry.majorSeconds += Math.round(seg.fraction * 86400);
      }
    }
    dayEntry.outageSeconds = dayEntry.partialSeconds + dayEntry.majorSeconds;
    dayEntry.barColor = getBarColor(dayEntry.partialSeconds, dayEntry.majorSeconds);
  }

  const todayEntry = days.find((d) => d.date === todayStr);
  if (todayEntry && STATUS_SEVERITY[currentStatus] > STATUS_SEVERITY[todayEntry.status]) {
    todayEntry.status = currentStatus;
  }

  return days;
}

// Extract outage periods from component-level status transitions.
// Only partial_outage and major_outage count as outage (matching status.claude.com).
function getClaudeCodeOutagePeriods(incident) {
  const transitions = [];
  for (const update of (incident.incident_updates || [])) {
    for (const comp of (update.affected_components || [])) {
      if (comp.code === CLAUDE_CODE_ID) {
        transitions.push({
          time: new Date(update.created_at).getTime(),
          newStatus: comp.new_status,
        });
      }
    }
  }

  transitions.sort((a, b) => a.time - b.time);

  const periods = [];
  let outageStart = null;
  let outageStatus = null;

  for (const t of transitions) {
    const isOutage = t.newStatus === 'partial_outage' || t.newStatus === 'major_outage';

    if (isOutage && outageStart === null) {
      // Entering outage
      outageStart = t.time;
      outageStatus = t.newStatus;
    } else if (isOutage && outageStart !== null) {
      // Still in outage, track worst severity
      if (STATUS_SEVERITY[t.newStatus] > STATUS_SEVERITY[outageStatus]) {
        outageStatus = t.newStatus;
      }
    } else if (!isOutage && outageStart !== null) {
      // Outage ended
      periods.push({ start: outageStart, end: t.time, status: outageStatus });
      outageStart = null;
      outageStatus = null;
    }
  }

  // If still in outage, close with incident resolution or now
  if (outageStart !== null) {
    const end = incident.resolved_at
      ? new Date(incident.resolved_at).getTime()
      : Date.now();
    periods.push({ start: outageStart, end: end, status: outageStatus });
  }

  return periods;
}

function buildDaySegments(rawSegments) {
  if (rawSegments.length === 0) {
    return [{ fraction: 1, status: 'operational' }];
  }

  rawSegments.sort((a, b) => a.start - b.start);

  // Merge overlapping segments using worst status
  const merged = [];
  for (const seg of rawSegments) {
    if (merged.length > 0 && seg.start <= merged[merged.length - 1].end) {
      const last = merged[merged.length - 1];
      last.end = Math.max(last.end, seg.end);
      if (STATUS_SEVERITY[seg.status] > STATUS_SEVERITY[last.status]) {
        last.status = seg.status;
      }
    } else {
      merged.push({ start: seg.start, end: seg.end, status: seg.status });
    }
  }

  // Fill gaps with operational
  const result = [];
  let cursor = 0;
  for (const seg of merged) {
    if (seg.start > cursor + 0.001) {
      result.push({ fraction: seg.start - cursor, status: 'operational' });
    }
    result.push({ fraction: seg.end - seg.start, status: seg.status });
    cursor = seg.end;
  }
  if (cursor < 0.999) {
    result.push({ fraction: 1 - cursor, status: 'operational' });
  }

  return result;
}

function getWorstStatusFromIncident(incident) {
  let worst = 'operational';
  for (const update of incident.incident_updates || []) {
    for (const comp of update.affected_components || []) {
      // affected_components use 'code' field (same value as component 'id')
      if (comp.code === CLAUDE_CODE_ID) {
        if (STATUS_SEVERITY[comp.new_status] > STATUS_SEVERITY[worst]) {
          worst = comp.new_status;
        }
      }
    }
  }
  return worst;
}

function getRecentIncidents(allIncidents) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  return allIncidents
    .filter((incident) => {
      const started = new Date(incident.started_at);
      if (started < sevenDaysAgo) return false;
      return getWorstStatusFromIncident(incident) !== 'operational';
    })
    .map((incident) => ({
      name: incident.name,
      status: incident.status,
      impact: incident.impact,
      startedAt: incident.started_at,
      resolvedAt: incident.resolved_at,
      shortlink: incident.shortlink,
      updates: (incident.incident_updates || []).map((u) => ({
        status: u.status,
        body: u.body,
        createdAt: u.created_at,
      })),
    }));
}

function formatStatus(status) {
  const labels = {
    operational: 'Operational',
    degraded_performance: 'Degraded Performance',
    partial_outage: 'Partial Outage',
    major_outage: 'Major Outage',
  };
  return labels[status] || status;
}

chrome.alarms.create('poll-status', { periodInMinutes: POLL_INTERVAL_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll-status') {
    pollStatus();
  }
});

// Also poll immediately on service worker startup
pollStatus();
