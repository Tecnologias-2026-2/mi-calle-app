const topbarMenus = [...document.querySelectorAll(".topbar-menu")];

function closeTopbarMenus(except = null) {
  topbarMenus.forEach((menu) => {
    if (menu !== except) {
      const popover = menu.querySelector(".topbar-popover");
      const trigger = menu.querySelector("button");
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

topbarMenus.forEach((menu) => {
  const trigger = menu.querySelector("button");
  const popover = menu.querySelector(".topbar-popover");

  trigger.addEventListener("click", () => {
    const willOpen = popover.hidden;
    closeTopbarMenus(willOpen ? menu : null);
    popover.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".topbar-menu")) {
    closeTopbarMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarMenus();
  }
});

const reportStatus = {
  pendiente: { label: "Pendiente", color: "red" },
  en_revision: { label: "En revisión", color: "amber" },
  en_proceso: { label: "En proceso", color: "blue" },
  reparado: { label: "Reparado", color: "green" },
  descartado: { label: "Descartado", color: "slate" },
  proceso: { label: "En proceso", color: "blue" },
  resuelto: { label: "Resuelto", color: "green" },
};

const severityColors = {
  alta: "red",
  media: "amber",
  baja: "green",
};

const statusColors = {
  en_revision: "#FFD54F",
  en_proceso: "#2A9DF4",
  reparado: "#4CAF50",
  proceso: "#2A9DF4",
  resuelto: "#4CAF50",
  pendiente: "#FF6876",
  descartado: "#486581",
};
const formatReportCategory = window.MiCalleReportFormatters.formatCategory;

function normalizeStatus(status) {
  return ({
    proceso: "en_proceso",
    resuelto: "reparado",
  })[status] || status;
}

function formatDate(date) {
  const value = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date}T12:00:00`
    : date;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function renderKpis(statistics, reports) {
  const container = document.querySelector("#admin-kpis");
  if (!container) {
    return;
  }
  container.setAttribute("aria-busy", "false");

  const counts = reports.reduce((result, report) => {
    result.total += 1;
    const status = normalizeStatus(report.status);
    if (Object.prototype.hasOwnProperty.call(result, status)) {
      result[status] += 1;
    }
    return result;
  }, { total: 0, pendiente: 0, en_revision: 0, en_proceso: 0, reparado: 0, descartado: 0 });
  container.classList.toggle("has-discarded", statistics.some((statistic) => statistic.id === "descartado"));

  container.replaceChildren(...statistics.map((statistic) => {
    const card = createElement("article", "stat-card");
    const top = createElement("div", "stat-top");
    const icon = createElement("span", `stat-icon icon-${statistic.icono}`, "•");
    icon.setAttribute("aria-hidden", "true");
    top.append(icon, createElement("span", "stat-change neutral", statistic.indicador));
    card.append(
      top,
      createElement("p", "stat-label", statistic.etiqueta),
      createElement(
        "div",
        "stat-value",
        String(statistic.id === "total"
          ? counts.total
          : statistic.id === "en_proceso"
            ? counts.en_revision + counts.en_proceso
            : counts[normalizeStatus(statistic.id)] ?? 0),
      ),
      createElement("p", "stat-note", statistic.nota),
    );
    return card;
  }));
}

function renderStatusSummary(reports) {
  const chart = document.querySelector(".donut-chart");
  if (!chart) {
    return;
  }

  const statusOrder = ["pendiente", "en_revision", "en_proceso", "reparado", "descartado"];
  const statusLabels = {
    pendiente: "Pendientes",
    en_revision: "En revisión",
    en_proceso: "En proceso",
    reparado: "Reparados",
    descartado: "Descartados",
  };
  const total = reports.length;
  let degrees = 0;
  const segments = statusOrder.map((status) => {
    const count = reports.filter((report) => normalizeStatus(report.status) === status).length;
    const nextDegrees = total ? degrees + (count / total) * 360 : degrees;
    const segment = `${statusColors[status]} ${degrees}deg ${nextDegrees}deg`;
    degrees = nextDegrees;
    return { status, label: statusLabels[status], count, segment };
  });

  chart.style.background = total
    ? `conic-gradient(${segments.map(({ segment }) => segment).join(", ")})`
    : "#edf1f6";
  chart.setAttribute("aria-label", `${total} reportes: ${segments.map(({ label, count }) => `${count} ${label.toLocaleLowerCase("es")}`).join(", ")}.`);
  chart.querySelector(".donut-center strong").textContent = String(total);

  const legend = document.querySelector(".status-panel .legend");
  if (legend) {
    legend.replaceChildren(...segments.map(({ status, label, count }) => {
      const item = createElement("li");
      const labelContainer = createElement("span", "legend-label");
      const dot = createElement("i", `legend-dot dot-${statusColorsName(status)}`);
      dot.setAttribute("aria-hidden", "true");
      labelContainer.append(dot, document.createTextNode(label));
      item.append(labelContainer, createElement("strong", "", String(count)));
      return item;
    }));
  }
}

function renderCategorySummary(reports) {
  const container = document.querySelector(".type-list");
  if (!container) {
    return;
  }
  container.setAttribute("aria-busy", "false");

  const categoryCounts = [...reports.reduce((counts, report) => {
    const category = formatReportCategory(report.type);
    counts.set(category, (counts.get(category) || 0) + 1);
    return counts;
  }, new Map()).entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "es"));

  if (categoryCounts.length === 0) {
    container.replaceChildren(createElement("p", "reports-empty", "No hay categorías registradas."));
    return;
  }

  const maximum = categoryCounts[0][1];
  const fillColors = ["fill-blue", "fill-indigo", "fill-sky", "fill-pale"];
  container.replaceChildren(...categoryCounts.map(([category, count], index) => {
    const row = createElement("div", "type-row");
    const track = createElement("div", "type-track");
    const fill = createElement("span", `type-fill ${fillColors[index % fillColors.length]}`);
    fill.style.setProperty("--fill-width", `${(count / maximum) * 100}%`);
    track.append(fill);
    row.append(createElement("span", "type-name", category), track, createElement("strong", "", String(count)));
    return row;
  }));
}

function parseReportCreatedAt(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const raw = value.trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1
      || date.getDate() !== day) return null;
    return date.getTime();
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getReportCreatedAt(report) {
  const candidates = [
    report.createdAt,
    report.fecha_creacion,
    report.created_at,
    report.fecha,
  ];
  for (const candidate of candidates) {
    const timestamp = parseReportCreatedAt(candidate);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function getLocalDayOffset(timestamp, startDate) {
  const date = new Date(timestamp);
  const reportDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const startDay = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  return Math.floor((reportDay - startDay) / 86400000);
}

function getMonthLabel(date, currentYear) {
  const month = date.toLocaleDateString("es-CO", { month: "short" })
    .replace(/\.$/, "")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("es-CO"));
  return date.getFullYear() === currentYear ? month : `${month} ${date.getFullYear()}`;
}

function renderPeriodSummary(reports, periodDays = 30) {
  const chart = document.querySelector("#admin-period-chart");
  const axis = document.querySelector(".chart-area .y-axis");
  if (!chart || !axis) return;

  const requestedDays = Number(periodDays);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let periodStart;
  let labels;
  let counts;
  let periodDescription;

  if (days === 7) {
    periodStart = new Date(today);
    periodStart.setDate(periodStart.getDate() - 6);
    labels = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(periodStart);
      date.setDate(date.getDate() + index);
      return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
    });
    counts = Array(7).fill(0);
    periodDescription = "últimos 7 días";
  } else if (days === 30) {
    periodStart = new Date(today);
    periodStart.setDate(periodStart.getDate() - 29);
    labels = ["Sem. 1", "Sem. 2", "Sem. 3", "Sem. 4"];
    counts = Array(4).fill(0);
    periodDescription = "últimos 30 días";
  } else {
    periodStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    labels = Array.from({ length: 3 }, (_, index) => (
      getMonthLabel(new Date(periodStart.getFullYear(), periodStart.getMonth() + index, 1), today.getFullYear())
    ));
    counts = Array(3).fill(0);
    periodDescription = "últimos 3 meses calendario";
  }

  reports.forEach((report) => {
    const createdAt = getReportCreatedAt(report);
    if (createdAt === null || createdAt < periodStart.getTime() || createdAt > now) return;

    let bucket;
    if (days === 90) {
      const date = new Date(createdAt);
      bucket = (date.getFullYear() - periodStart.getFullYear()) * 12
        + date.getMonth() - periodStart.getMonth();
    } else {
      const dayOffset = getLocalDayOffset(createdAt, periodStart);
      if (days === 7) {
        if (dayOffset < 0 || dayOffset >= 7) return;
        bucket = dayOffset;
      } else {
        if (dayOffset < 0 || dayOffset >= 30) return;
        bucket = Math.min(3, Math.floor(dayOffset / 7));
      }
    }
    if (bucket < 0 || bucket >= counts.length) return;
    counts[bucket] += 1;
  });

  const maximum = Math.max(...counts);
  const axisStep = maximum <= 3 ? 1 : Math.max(1, Math.ceil(maximum / 5));
  const axisMaximum = maximum <= 3
    ? Math.max(1, maximum + 1)
    : (Math.floor(maximum / axisStep) + 1) * axisStep;
  const axisValues = Array.from(
    { length: axisMaximum / axisStep + 1 },
    (_, index) => axisMaximum - index * axisStep,
  );
  axis.replaceChildren(...axisValues.map((value) => createElement("span", "", String(value))));

  const gridlines = createElement("div", "chart-gridlines");
  gridlines.setAttribute("aria-hidden", "true");
  gridlines.append(...axisValues.map(() => createElement("i")));
  const columns = counts.map((count, index) => {
    const column = createElement("div", "bar-column");
    const track = createElement("span", "bar-track");
    const bar = createElement("span", "bar");
    const height = `${(count / axisMaximum) * 100}%`;
    bar.style.setProperty("--bar-height", height);
    bar.title = `${count} reportes · ${labels[index]}`;
    const value = createElement("span", "bar-value", String(count));
    value.style.setProperty("--bar-height", height);
    const label = createElement("span", "bar-label", labels[index]);
    track.append(bar, value);
    column.append(track, label);
    return column;
  });
  chart.replaceChildren(gridlines, ...columns);
  chart.parentElement.setAttribute(
    "aria-label",
    `Reportes en los ${periodDescription}: ${counts.map((count, index) => `${labels[index]}, ${count}`).join("; ")}.`,
  );
}

function statusColorsName(status) {
  return {
    pendiente: "red",
    en_revision: "amber",
    en_proceso: "blue",
    reparado: "green",
    descartado: "slate",
    proceso: "blue",
    resuelto: "green",
  }[status];
}

function renderReports(reports, total) {
  document.querySelectorAll("[data-report-count]").forEach((element) => {
    element.textContent = String(total);
  });

  const container = document.querySelector("#admin-reports");
  if (!container) {
    return;
  }
  container.setAttribute("aria-busy", "false");

  const cards = reports.map((report) => {
    const status = reportStatus[normalizeStatus(report.status)] || reportStatus.pendiente;
    const severity = severityColors[report.gravedad] || "media";
    const link = createElement("a", "report-list-card panel");
    link.href = `reports.html?id=${encodeURIComponent(report.id)}`;
    link.dataset.reportId = report.id;
    if (report.photo?.url) {
      const photo = createElement("img", "report-list-photo");
      photo.src = report.photo.url;
      photo.alt = `Fotografía del reporte ${report.id}`;
      link.append(photo);
    } else {
      const reportIcon = createElement("span", `report-list-icon report-list-icon--${severity}`, "#");
      reportIcon.setAttribute("aria-hidden", "true");
      link.append(reportIcon);
    }
    const main = createElement("span", "report-list-main");
    const reporterDetails = [
      report.reporter?.name || "Reportante no disponible",
      report.reporter?.phone,
    ].filter(Boolean).join(" · ");
    main.append(
      createElement("strong", "", `#${report.id} · ${formatReportCategory(report.type)}`),
      createElement("small", "", `${report.location.address || "Ubicación no disponible"} · ${reporterDetails}`),
    );
    link.append(
      main,
      createElement("span", `report-list-status report-list-status--${status.color}`, status.label),
      createElement("span", "report-list-date", formatDate(report.createdAt)),
      createElement("span", "report-list-arrow", "→"),
    );
    return link;
  });

  if (cards.length === 0) {
    cards.push(createElement("p", "reports-empty", "No hay reportes que coincidan con los filtros."));
  }
  container.replaceChildren(...cards);

  const count = document.querySelector("#reports-total-count");
  if (count) {
    count.textContent = String(total);
  }
  const note = document.querySelector("#reports-filter-note");
  if (note) {
    note.textContent = `Mostrando ${reports.length} de ${total} reportes`;
  }
}

function renderReportDetails(report) {
  const reportId = document.querySelector(".report-id");
  if (!reportId) {
    return;
  }

  const fullReportId = String(report.id || "");
  const compactReportId = fullReportId.length > 8
    ? `#${fullReportId.slice(0, 8)}…`
    : `#${fullReportId || "ID no disponible"}`;
  const reportIdLabel = createElement("span", "report-id-value", compactReportId);
  reportIdLabel.title = fullReportId ? `ID completo: ${fullReportId}` : "ID no disponible";
  reportId.replaceChildren(reportIdLabel);
  if (fullReportId) {
    const copyButton = createElement("button", "report-id-copy", "Copiar");
    copyButton.type = "button";
    copyButton.dataset.reportId = fullReportId;
    copyButton.setAttribute("aria-label", "Copiar identificador completo del reporte");
    reportId.append(copyButton);
  }

  const displayType = report.type
    ? formatReportCategory(report.type)
    : "Tipo no disponible";
  const facts = document.querySelectorAll(".report-facts dd");
  if (facts[0]) facts[0].textContent = displayType;
  const reportDate = report.createdAt ? new Date(report.createdAt) : new Date(Number.NaN);
  facts[1].textContent = Number.isNaN(reportDate.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(reportDate);
  facts[2].textContent = report.location.address || "Ubicación no disponible";
  facts[3].textContent = report.reporter?.name || "Reportante no disponible";
  if (facts[4]) facts[4].textContent = report.reporter?.phone || "Teléfono no disponible";
  document.querySelector(".report-description p").textContent = report.description;

  const normalizedStatus = normalizeStatus(report.status);
  const selectedStatus = reportStatus[normalizedStatus];
  const currentStatus = document.querySelector(".current-status strong");
  currentStatus.textContent = selectedStatus.label;
  currentStatus.className = `report-list-status report-list-status--${selectedStatus.color}`;
  const statusIndicator = document.querySelector(".status-indicator");
  statusIndicator.className = `status-indicator status-indicator--${selectedStatus.color}`;

  const selectedOption = document.querySelector(`input[name="report-status"][value="${normalizedStatus}"]`);
  if (selectedOption) {
    selectedOption.checked = true;
    selectedOption.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const historyList = document.querySelector("#admin-report-history");
  if (historyList) {
    historyList.setAttribute("aria-busy", "false");
    const history = report.history || [];
    if (!history.length) {
      historyList.replaceChildren(createElement("li", "", "Historial no disponible en esta conexión."));
    } else {
      historyList.replaceChildren(...history.map((entry) => {
        const status = reportStatus[normalizeStatus(entry.status)]?.label || entry.status;
        const date = entry.changedAt
          ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" })
            .format(new Date(entry.changedAt))
          : "Fecha no disponible";
        const observation = entry.observation ? ` — ${entry.observation}` : "";
        return createElement("li", "", `${status} · ${date}${observation}`);
      }));
    }
  }

  const photoContainer = document.querySelector(".evidence-photo");
  if (photoContainer) {
    const photoUrl = report.photo?.url;
    if (photoUrl) {
      const image = createElement("img", "admin-evidence-image");
      image.src = photoUrl;
      image.alt = `Fotografía de evidencia: ${displayType}`;
      photoContainer.replaceChildren(image);
    } else {
      photoContainer.replaceChildren(createElement("p", "photo-caption", "Este reporte no tiene fotografía adjunta."));
    }
  }
}

function showAdminError(message) {
  let feedback = document.querySelector("#admin-data-feedback");
  if (!feedback) {
    feedback = createElement("p", "admin-data-feedback");
    feedback.id = "admin-data-feedback";
    feedback.setAttribute("role", "alert");
    const content = document.querySelector(".dashboard-content");
    if (content) {
      content.prepend(feedback);
    }
  }
  if (feedback) {
    feedback.textContent = message;
    feedback.hidden = false;
  }
}

function showAdminLoading() {
  const reports = document.querySelector("#admin-reports");
  if (reports) {
    reports.setAttribute("aria-busy", "true");
    const loading = createElement("p", "reports-empty admin-loading", "Cargando reportes...");
    loading.setAttribute("role", "status");
    reports.replaceChildren(loading);
  }

  const kpis = document.querySelector("#admin-kpis");
  if (kpis) {
    kpis.setAttribute("aria-busy", "true");
    kpis.replaceChildren(...Array.from({ length: 4 }, () => {
      const card = createElement("article", "stat-card admin-skeleton");
      card.setAttribute("aria-hidden", "true");
      return card;
    }));
  }

  const categorySummary = document.querySelector(".type-list");
  if (categorySummary) {
    categorySummary.setAttribute("aria-busy", "true");
    const loading = createElement("p", "reports-empty admin-loading", "Cargando categorías...");
    loading.setAttribute("role", "status");
    categorySummary.replaceChildren(loading);
  }

  const history = document.querySelector("#admin-report-history");
  if (history) {
    history.setAttribute("aria-busy", "true");
    const loading = createElement("li", "admin-loading", "Cargando historial...");
    loading.setAttribute("role", "status");
    history.replaceChildren(loading);
  }
}

function clearAdminLoading() {
  ["#admin-reports", "#admin-kpis", ".type-list", "#admin-report-history"].forEach((selector) => {
    const container = document.querySelector(selector);
    if (!container) return;
    container.setAttribute("aria-busy", "false");
    container.querySelectorAll(".admin-loading, .admin-skeleton").forEach((element) => element.remove());
  });
}

function clearAdminError() {
  const feedback = document.querySelector("#admin-data-feedback");
  if (feedback) {
    feedback.hidden = true;
  }
}

window.AdminUI = {
  clearAdminError,
  clearAdminLoading,
  renderKpis,
  renderPeriodSummary,
  renderCategorySummary,
  renderReportDetails,
  renderReports,
  renderStatusSummary,
  showAdminLoading,
  showAdminError,
};
