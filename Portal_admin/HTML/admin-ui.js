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
  pendiente: { label: "Pendiente", color: "amber" },
  en_revision: { label: "En revisión", color: "amber" },
  en_proceso: { label: "En proceso", color: "blue" },
  reparado: { label: "Reparado", color: "green" },
  proceso: { label: "En proceso", color: "blue" },
  resuelto: { label: "Resuelto", color: "green" },
  descartado: { label: "Descartado", color: "red" },
};

const severityColors = {
  alta: "red",
  media: "amber",
  baja: "green",
};

const statusColors = {
  en_revision: "#e6a42c",
  en_proceso: "#347ff0",
  reparado: "#38bd84",
  proceso: "#347ff0",
  resuelto: "#38bd84",
  pendiente: "#f2b743",
  descartado: "#dc626b",
};

function normalizeStatus(status) {
  return ({
    proceso: "en_proceso",
    resuelto: "reparado",
    descartado: "pendiente",
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

  const counts = reports.reduce((result, report) => {
    result.total += 1;
    const status = normalizeStatus(report.status);
    if (Object.prototype.hasOwnProperty.call(result, status)) {
      result[status] += 1;
    }
    return result;
  }, { total: 0, pendiente: 0, en_revision: 0, en_proceso: 0, reparado: 0 });

  container.replaceChildren(...statistics.map((statistic) => {
    const card = createElement("article", "stat-card");
    const top = createElement("div", "stat-top");
    const icon = createElement("span", `stat-icon icon-${statistic.icono}`, "•");
    icon.setAttribute("aria-hidden", "true");
    top.append(icon, createElement("span", "stat-change neutral", statistic.indicador));
    card.append(
      top,
      createElement("p", "stat-label", statistic.etiqueta),
      createElement("div", "stat-value", String(statistic.count ?? counts[normalizeStatus(statistic.id)] ?? 0)),
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

  const statusOrder = ["pendiente", "en_revision", "en_proceso", "reparado"];
  const statusLabels = {
    pendiente: "Pendientes",
    en_revision: "En revisión",
    en_proceso: "En proceso",
    reparado: "Reparados",
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

  const categoryCounts = [...reports.reduce((counts, report) => {
    counts.set(report.type, (counts.get(report.type) || 0) + 1);
    return counts;
  }, new Map()).entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "es"))
    .slice(0, 4);

  if (categoryCounts.length === 0) {
    container.replaceChildren(createElement("p", "reports-empty", "No hay categorías registradas."));
    return;
  }

  const maximum = categoryCounts[0][1];
  const fillColors = ["fill-blue", "fill-indigo", "fill-sky", "fill-pale"];
  container.replaceChildren(...categoryCounts.map(([category, count], index) => {
    const row = createElement("div", "type-row");
    const track = createElement("div", "type-track");
    const fill = createElement("span", `type-fill ${fillColors[index]}`);
    fill.style.setProperty("--fill-width", `${(count / maximum) * 100}%`);
    track.append(fill);
    row.append(createElement("span", "type-name", category), track, createElement("strong", "", String(count)));
    return row;
  }));
}

function renderPeriodSummary(reports, periodDays = 30) {
  const chart = document.querySelector("#admin-period-chart");
  const axis = document.querySelector(".chart-area .y-axis");
  if (!chart || !axis) return;

  const days = Number(periodDays) || 30;
  const now = Date.now();
  const periodStart = now - days * 24 * 60 * 60 * 1000;
  const bucketSize = (now - periodStart) / 4;
  const counts = [0, 0, 0, 0];
  reports.forEach((report) => {
    const createdAt = new Date(report.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt < periodStart || createdAt > now) return;
    const bucket = Math.min(3, Math.floor((createdAt - periodStart) / bucketSize));
    counts[bucket] += 1;
  });

  const maximum = Math.max(...counts);
  const axisMaximum = Math.max(5, Math.ceil(maximum / 5) * 5);
  axis.replaceChildren(...Array.from({ length: 6 }, (_, index) => (
    createElement("span", "", String(Math.round(axisMaximum * (5 - index) / 5)))
  )));

  const gridlines = createElement("div", "chart-gridlines");
  gridlines.setAttribute("aria-hidden", "true");
  gridlines.append(...Array.from({ length: 6 }, () => createElement("i")));
  const columns = counts.map((count, index) => {
    const column = createElement("div", "bar-column");
    const bar = createElement("span", "bar");
    bar.style.setProperty("--bar-height", `${maximum ? (count / maximum) * 100 : 0}%`);
    bar.title = `${count} reportes`;
    const label = createElement("span", "bar-label", `Sem. ${index + 1}`);
    column.append(bar, label);
    return column;
  });
  chart.replaceChildren(gridlines, ...columns);
  chart.parentElement.setAttribute(
    "aria-label",
    `Reportes en los últimos ${days} días: ${counts.map((count, index) => `semana ${index + 1}, ${count}`).join("; ")}.`,
  );
}

function statusColorsName(status) {
  return {
    pendiente: "amber",
    en_revision: "amber",
    en_proceso: "blue",
    reparado: "green",
    proceso: "blue",
    resuelto: "green",
    descartado: "red",
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
      createElement("strong", "", `#${report.id} · ${report.type}`),
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

  reportId.textContent = `#${report.id}`;
  const facts = document.querySelectorAll(".report-facts dd");
  facts[0].textContent = report.type;
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

  const selectedOption = document.querySelector(`input[name="report-status"][value="${normalizedStatus}"]`);
  if (selectedOption) {
    selectedOption.checked = true;
    selectedOption.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const historyList = document.querySelector("#admin-report-history");
  if (historyList) {
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
      image.alt = `Fotografía de evidencia: ${report.type}`;
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

function clearAdminError() {
  const feedback = document.querySelector("#admin-data-feedback");
  if (feedback) {
    feedback.hidden = true;
  }
}

window.AdminUI = {
  clearAdminError,
  renderKpis,
  renderPeriodSummary,
  renderCategorySummary,
  renderReportDetails,
  renderReports,
  renderStatusSummary,
  showAdminError,
};
