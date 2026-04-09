const STATUS_COLORS_LIGHT = {
  operational: '#76AD2A',
  degraded_performance: '#D4A017',
  partial_outage: '#E86235',
  major_outage: '#E04343',
};

const STATUS_COLORS_DARK = {
  operational: '#76AD2A',
  degraded_performance: '#D4A017',
  partial_outage: '#E86235',
  major_outage: '#E04343',
};

// Exact colors from status.claude.com bar segments
const BAR_COLORS = {
  operational: '#76AD2A',
  degraded_performance: '#E86235',
  partial_outage: '#E86235',
  major_outage: '#E04343',
};

const STATUS_LABELS = {
  operational: 'Operational',
  degraded_performance: 'Degraded Performance',
  partial_outage: 'Partial Outage',
  major_outage: 'Major Outage',
};

// Keep in sync with background.js
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

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(
    ['currentStatus', 'otherServices', 'sevenDayHistory', 'recentIncidents'],
    (data) => {
      renderHeader(data.currentStatus || 'operational');
      renderStatusBar(data.sevenDayHistory || []);
      renderServices(data.otherServices || []);
      renderIncidents(data.recentIncidents || []);
    }
  );
});

function isDarkMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getStatusColor(status) {
  const colors = isDarkMode() ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;
  return colors[status] || colors.operational;
}

function renderHeader(status) {
  const color = getStatusColor(status);
  const label = STATUS_LABELS[status] || status;

  // Draw spark SVG
  const svg = document.getElementById('header-spark');
  const ns = 'http://www.w3.org/2000/svg';
  const cx = 14, cy = 14, maxR = 12;

  for (const ray of SPARK_RAYS) {
    const rad = (ray.angle * Math.PI) / 180;
    const len = maxR * ray.length;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', cx);
    line.setAttribute('y1', cy);
    line.setAttribute('x2', cx + Math.cos(rad) * len);
    line.setAttribute('y2', cy + Math.sin(rad) * len);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2.8');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }

  const headerStatus = document.getElementById('header-status');
  headerStatus.textContent = `● ${label}`;
  headerStatus.style.color = color;
}

function renderStatusBar(days) {
  const bar = document.getElementById('status-bar');
  bar.innerHTML = '';

  if (days.length === 0) return;

  for (const day of days) {
    const el = document.createElement('div');
    el.className = 'status-bar-day';
    el.style.backgroundColor = BAR_COLORS[day.status] || BAR_COLORS.operational;

    const tooltip = document.createElement('div');
    tooltip.className = 'day-tooltip';
    const dateLabel = formatDate(day.date);
    if (day.status !== 'operational' && day.outageSeconds > 0) {
      const outageLabel = day.status === 'major_outage' ? 'Major outage' : 'Partial outage';
      tooltip.textContent = `${dateLabel}: ${outageLabel} — ${formatDuration(day.outageSeconds)}`;
    } else if (day.incidents.length > 0) {
      tooltip.textContent = `${dateLabel}: ${day.incidents[0]}`;
    } else {
      tooltip.textContent = `${dateLabel}: No downtime`;
    }
    el.appendChild(tooltip);
    bar.appendChild(el);
  }

  document.getElementById('bar-label-start').textContent = formatDate(days[0].date);
  document.getElementById('bar-label-end').textContent = formatDate(days[days.length - 1].date);
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function renderServices(services) {
  const section = document.getElementById('services-section');
  section.innerHTML = '';

  for (const service of services) {
    const row = document.createElement('div');
    row.className = 'service-row';

    const name = document.createElement('span');
    name.className = 'service-name';
    name.textContent = service.name;

    const dot = document.createElement('span');
    dot.className = 'service-dot';
    dot.textContent = '●';
    dot.style.color = getStatusColor(service.status);

    row.appendChild(name);
    row.appendChild(dot);
    section.appendChild(row);
  }
}

function renderIncidents(incidents) {
  const section = document.getElementById('incidents-section');
  section.innerHTML = '';

  if (incidents.length === 0) {
    const el = document.createElement('div');
    el.className = 'no-incidents';
    el.textContent = 'No recent incidents';
    section.appendChild(el);
    return;
  }

  for (const incident of incidents) {
    const el = document.createElement('div');
    el.className = 'incident';

    const name = document.createElement('div');
    name.className = 'incident-name';
    name.textContent = incident.name;

    const meta = document.createElement('div');
    meta.className = 'incident-meta';

    const startDate = new Date(incident.startedAt);
    const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const startTime = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });

    let timeRange = `${dateStr} · ${startTime}`;
    if (incident.resolvedAt) {
      const endTime = new Date(incident.resolvedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
      timeRange += `–${endTime} UTC`;
    } else {
      timeRange += ' UTC';
    }

    const statusSpan = document.createElement('span');
    statusSpan.className = `incident-status incident-status-${incident.status}`;
    statusSpan.textContent = ` · ${capitalize(incident.status)}`;

    meta.textContent = timeRange;
    meta.appendChild(statusSpan);

    el.appendChild(name);
    el.appendChild(meta);
    section.appendChild(el);
  }
}

function formatDuration(seconds) {
  if (seconds < 60) return '< 1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} mins`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs} hrs ${remMins} mins` : `${hrs} hrs`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
