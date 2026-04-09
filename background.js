const CLAUDE_CODE_ID = 'yyzkbfz2thpt';
const API_BASE = 'https://status.claude.com/api/v2';
const POLL_INTERVAL_MINUTES = 0.5; // 30 seconds

const STATUS_SEVERITY = {
  operational: 0,
  degraded_performance: 1,
  partial_outage: 2,
  major_outage: 3,
};

// Organic spark rays — angles and relative lengths (0-1 scale)
const SPARK_RAYS = [
  { angle: -90, length: 1.0 },
  { angle: -53, length: 0.72 },
  { angle: -27, length: 0.87 },
  { angle: 5, length: 0.92 },
  { angle: 35, length: 0.7 },
  { angle: 63, length: 0.9 },
  { angle: 97, length: 0.83 },
  { angle: 127, length: 0.73 },
  { angle: 160, length: 0.88 },
  { angle: -160, length: 0.8 },
  { angle: -120, length: 0.76 },
];

const STATUS_COLORS = {
  operational: '#4ade80',
  degraded_performance: '#facc15',
  partial_outage: '#f97316',
  major_outage: '#ef4444',
};

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
  const maxRadius = size * 0.45;
  const lineWidth = Math.max(1.5, size * 0.08);

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  for (const ray of SPARK_RAYS) {
    const radians = (ray.angle * Math.PI) / 180;
    const len = maxRadius * ray.length;
    const x = cx + Math.cos(radians) * len;
    const y = cy + Math.sin(radians) * len;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

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

    const sevenDayHistory = buildSevenDayHistory(incidents.incidents || []);

    const recentIncidents = getRecentIncidents(incidents.incidents || []);

    await chrome.storage.local.set({
      currentStatus,
      otherServices,
      sevenDayHistory,
      recentIncidents,
      lastUpdated: Date.now(),
    });

    await updateIcon(currentStatus);
    const statusText = formatStatus(currentStatus);
    chrome.action.setTitle({ title: `Claude Code: ${statusText}` });
  } catch (err) {
    console.error('Poll failed:', err);
  }
}

function buildSevenDayHistory(allIncidents) {
  const now = new Date();
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    days.push({ date: dateStr, status: 'operational', incidents: [] });
  }

  for (const incident of allIncidents) {
    const startDate = new Date(incident.started_at).toISOString().slice(0, 10);
    const affectsClaude = (incident.components || []).some((c) => c.id === CLAUDE_CODE_ID);
    if (!affectsClaude) continue;

    const dayEntry = days.find((d) => d.date === startDate);
    if (!dayEntry) continue;

    dayEntry.incidents.push(incident.name);

    const worstStatus = getWorstStatusFromIncident(incident);
    if (STATUS_SEVERITY[worstStatus] > STATUS_SEVERITY[dayEntry.status]) {
      dayEntry.status = worstStatus;
    }
  }

  return days;
}

function getWorstStatusFromIncident(incident) {
  let worst = 'operational';
  for (const update of incident.incident_updates || []) {
    for (const comp of update.affected_components || []) {
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
      return (incident.components || []).some((c) => c.id === CLAUDE_CODE_ID);
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
