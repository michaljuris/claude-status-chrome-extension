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

// Exact colors from status.claude.com bar segments (4 distinct colors)
const BAR_COLORS = {
  operational: '#76AD2A',
  degraded_performance: '#D4A017',
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
const SPARK_RAYS = (() => {
  const step = 360 / 11;
  const lengths = [1.0, 0.88, 1.0, 0.88, 1.0, 0.88, 1.0, 0.88, 1.0, 0.88, 1.0];
  return lengths.map((len, i) => ({ angle: -90 + i * step, length: len }));
})();

// EKG path in 28x28 viewBox coordinates
const EKG_POINTS = [
  [2, 14], [7, 14], [8.5, 12.8], [10, 14], [11.5, 14],
  [12.5, 8], [15, 18], [17, 14], [19, 14],
  [20.5, 12.5], [22.5, 14], [26, 14],
];

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(
    ['currentStatus', 'otherServices', 'sevenDayHistory', 'recentIncidents', 'lastUpdated'],
    (data) => {
      renderHeader(data.currentStatus || 'operational');
      renderStatusBar(data.sevenDayHistory || []);
      renderServices(data.otherServices || []);
      renderIncidents(data.recentIncidents || []);
      renderLastUpdated(data.lastUpdated);
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
    line.setAttribute('stroke-width', '2.6');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }

  // EKG knockout gap + pulse
  const ekgD = EKG_POINTS.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const bgColor = isDarkMode() ? '#1C1917' : '#FAF9F7';

  const gap = document.createElementNS(ns, 'path');
  gap.setAttribute('d', ekgD);
  gap.setAttribute('fill', 'none');
  gap.setAttribute('stroke', bgColor);
  gap.setAttribute('stroke-width', '4');
  gap.setAttribute('stroke-linecap', 'round');
  gap.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(gap);

  const pulse = document.createElementNS(ns, 'path');
  pulse.setAttribute('d', ekgD);
  pulse.setAttribute('fill', 'none');
  pulse.setAttribute('stroke', color);
  pulse.setAttribute('stroke-width', '1.8');
  pulse.setAttribute('stroke-linecap', 'round');
  pulse.setAttribute('stroke-linejoin', 'round');
  pulse.setAttribute('opacity', '0.5');
  svg.appendChild(pulse);

  const headerStatus = document.getElementById('header-status');
  headerStatus.textContent = label;
  headerStatus.style.backgroundColor = color + '1F';
  headerStatus.style.color = color;
}

function renderStatusBar(days) {
  const bar = document.getElementById('status-bar');
  bar.innerHTML = '';

  if (days.length === 0) return;

  days.forEach((day, index) => {
    const el = document.createElement('div');
    el.className = 'status-bar-day';
    el.style.animationDelay = `${index * 0.02}s`;
    el.style.backgroundColor = day.barColor || BAR_COLORS[day.status] || BAR_COLORS.operational;

    el.appendChild(buildTooltip(day));
    bar.appendChild(el);
  });

  document.getElementById('bar-label-start').textContent = formatDate(days[0].date);
  document.getElementById('bar-label-end').textContent = formatDate(days[days.length - 1].date);
}

function buildTooltip(day) {
  const tooltip = document.createElement('div');
  tooltip.className = 'day-tooltip';

  const dateEl = document.createElement('div');
  dateEl.className = 'tooltip-date';
  dateEl.textContent = formatDateFull(day.date);
  tooltip.appendChild(dateEl);

  if (day.status !== 'operational' && day.outageSeconds > 0) {
    const outageEl = document.createElement('div');
    outageEl.className = 'tooltip-outage';

    const dot = document.createElement('span');
    dot.className = 'tooltip-dot';
    dot.style.backgroundColor = day.barColor || BAR_COLORS[day.status] || BAR_COLORS.operational;
    outageEl.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'tooltip-outage-label';
    label.textContent = STATUS_LABELS[day.status] || day.status;
    outageEl.appendChild(label);

    const dur = document.createElement('span');
    dur.className = 'tooltip-duration';
    dur.textContent = formatDuration(day.outageSeconds);
    outageEl.appendChild(dur);

    tooltip.appendChild(outageEl);
  }

  if (day.incidents && day.incidents.length > 0) {
    const relLabel = document.createElement('div');
    relLabel.className = 'tooltip-related-label';
    relLabel.textContent = 'Related';
    tooltip.appendChild(relLabel);

    const unique = [...new Set(day.incidents)];
    for (const name of unique) {
      const inc = document.createElement('div');
      inc.className = 'tooltip-incident';
      inc.textContent = name;
      tooltip.appendChild(inc);
    }
  }

  if (!day.outageSeconds || day.outageSeconds === 0) {
    const ok = document.createElement('div');
    ok.className = 'tooltip-ok';
    ok.textContent = 'No downtime';
    tooltip.appendChild(ok);
  }

  return tooltip;
}

function formatDateFull(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function renderServices(services) {
  const section = document.getElementById('services-section');
  section.innerHTML = '';

  if (services.length === 0) return;

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'All services';
  section.appendChild(label);

  for (const service of services) {
    const row = document.createElement('div');
    row.className = 'service-row';

    const name = document.createElement('span');
    name.className = 'service-name';
    name.textContent = service.name;

    const dot = document.createElement('div');
    dot.className = 'service-dot';
    dot.style.backgroundColor = getStatusColor(service.status);

    row.appendChild(name);
    row.appendChild(dot);
    section.appendChild(row);
  }
}

function renderIncidents(incidents) {
  const section = document.getElementById('incidents-section');
  section.innerHTML = '';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Recent incidents';
  section.appendChild(label);

  if (incidents.length === 0) {
    const el = document.createElement('div');
    el.className = 'no-incidents';
    el.textContent = 'No incidents in the last 7 days';
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

function renderLastUpdated(timestamp) {
  const el = document.getElementById('footer-updated');
  if (!timestamp) return;

  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.textContent = `Updated ${time}`;
}
