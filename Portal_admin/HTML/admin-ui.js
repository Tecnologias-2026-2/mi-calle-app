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
  proceso: "#347ff0",
  resuelto: "#38bd84",
  pendiente: "#f2b743",
  descartado: "#dc626b",
};

function formatDate(date) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
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
    if (Object.prototype.hasOwnProperty.call(result, report.estado)) {
      result[report.estado] += 1;
    }
    return result;
  }, { total: 0, pendiente: 0, proceso: 0, resuelto: 0, descartado: 0 });

  container.replaceChildren(...statistics.map((statistic) => {
    const card = createElement("article", "stat-card");
    const top = createElement("div", "stat-top");
    const icon = createElement("span", `stat-icon icon-${statistic.icono}`, "•");
    icon.setAttribute("aria-hidden", "true");
    top.append(icon, createElement("span", "stat-change neutral", statistic.indicador));
    card.append(
      top,
      createElement("p", "stat-label", statistic.etiqueta),
      createElement("div", "stat-value", String(counts[statistic.id] ?? 0)),
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

  const statusOrder = ["proceso", "resuelto", "pendiente", "descartado"];
  const statusLabels = {
    proceso: "En proceso",
    resuelto: "Resueltos",
    pendiente: "Pendientes",
    descartado: "Descartados",
  };
  const total = reports.length;
  let degrees = 0;
  const segments = statusOrder.map((status) => {
    const count = reports.filter((report) => report.estado === status).length;
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
    counts.set(report.categoria, (counts.get(report.categoria) || 0) + 1);
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

function statusColorsName(status) {
  return { proceso: "blue", resuelto: "green", pendiente: "amber", descartado: "red" }[status];
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
    const status = reportStatus[report.estado];
    const severity = severityColors[report.gravedad];
    const link = createElement("a", "report-list-card panel");
    link.href = `reports.html?id=${encodeURIComponent(report.id)}`;
    link.dataset.reportId = report.id;
    const reportIcon = createElement("span", `report-list-icon report-list-icon--${severity}`, "#");
    reportIcon.setAttribute("aria-hidden", "true");
    link.append(reportIcon);
    const main = createElement("span", "report-list-main");
    main.append(
      createElement("strong", "", `#${report.id} · ${report.categoria}`),
      createElement("small", "", `${report.ubicacion} · ${report.reportadoPor}`),
    );
    link.append(
      main,
      createElement("span", `report-list-status report-list-status--${status.color}`, status.label),
      createElement("span", "report-list-date", formatDate(report.fecha)),
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
  facts[0].textContent = report.categoria;
  facts[1].textContent = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${report.fecha}T12:00:00`));
  facts[2].textContent = report.ubicacion;
  facts[3].textContent = report.reportadoPor;
  document.querySelector(".report-description p").textContent = report.descripcion;

  const selectedStatus = reportStatus[report.estado];
  const currentStatus = document.querySelector(".current-status strong");
  currentStatus.textContent = selectedStatus.label;
  currentStatus.className = `report-list-status report-list-status--${selectedStatus.color}`;

  const selectedOption = document.querySelector(`input[name="report-status"][value="${report.estado}"]`);
  if (selectedOption) {
    selectedOption.checked = true;
    selectedOption.dispatchEvent(new Event("change", { bubbles: true }));
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
  renderCategorySummary,
  renderReportDetails,
  renderReports,
  renderStatusSummary,
  showAdminError,
};
