const adminStorageKey = "mi-calle-admin-reportes-v1";
const adminDataUrl = new URL("admin-mock-data.json", document.currentScript.src);
const allowedReportStatuses = ["pendiente", "proceso", "resuelto", "descartado"];
const allowedSeverities = ["alta", "media", "baja"];

function isValidReport(report) {
  return report
    && typeof report.id === "string"
    && typeof report.categoria === "string"
    && typeof report.ubicacion === "string"
    && typeof report.reportadoPor === "string"
    && typeof report.fecha === "string"
    && typeof report.descripcion === "string"
    && allowedReportStatuses.includes(report.estado)
    && allowedSeverities.includes(report.gravedad);
}

async function loadAdminData() {
  const response = await fetch(adminDataUrl);
  if (!response.ok) {
    throw new Error(`No se pudo cargar admin-mock-data.json (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!Array.isArray(data.estadisticas) || !Array.isArray(data.reportes)) {
    throw new Error("El archivo JSON debe incluir las listas «estadisticas» y «reportes».");
  }
  if (data.reportes.some((report) => !isValidReport(report))) {
    throw new Error("El archivo JSON contiene uno o más reportes con datos inválidos.");
  }

  const storedReports = localStorage.getItem(adminStorageKey);
  if (storedReports === null) {
    return { statistics: data.estadisticas, reports: data.reportes };
  }

  const reports = JSON.parse(storedReports);
  if (!Array.isArray(reports) || reports.some((report) => !isValidReport(report))) {
    throw new Error("Los reportes guardados localmente tienen un formato inválido.");
  }
  return { statistics: data.estadisticas, reports };
}

function populateCategoryFilter(reports) {
  const categoryFilter = document.querySelector("#report-category-filter");
  if (!categoryFilter) {
    return;
  }

  const categories = [...new Set(reports.map((report) => report.categoria))]
    .sort((first, second) => first.localeCompare(second, "es"));
  categoryFilter.replaceChildren(new Option("Todas", ""));
  categories.forEach((category) => categoryFilter.add(new Option(category, category)));
}

function getFilteredReports(reports) {
  const search = document.querySelector("#report-search")?.value.trim().toLocaleLowerCase("es") || "";
  const status = document.querySelector("#report-status-filter")?.value || "";
  const category = document.querySelector("#report-category-filter")?.value || "";

  return reports.filter((report) => {
    const searchableText = [
      report.id,
      report.categoria,
      report.ubicacion,
      report.reportadoPor,
      report.descripcion,
    ].join(" ").toLocaleLowerCase("es");
    return (!search || searchableText.includes(search))
      && (!status || report.estado === status)
      && (!category || report.categoria === category);
  });
}

function renderAdminView(statistics, reports) {
  window.AdminUI.renderKpis(statistics, reports);
  window.AdminUI.renderStatusSummary(reports);
  window.AdminUI.renderCategorySummary(reports);
  window.AdminUI.renderReports(getFilteredReports(reports), reports.length);
}

function showUpdateFeedback(message, isError = false) {
  const feedback = document.querySelector(".update-feedback");
  if (!feedback) {
    return;
  }
  feedback.textContent = message;
  feedback.classList.toggle("is-error", isError);
  feedback.hidden = false;
}

function connectReportFilters(statistics, reports) {
  ["#report-search", "#report-status-filter", "#report-category-filter"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("input", () => {
      renderAdminView(statistics, reports);
    });
    document.querySelector(selector)?.addEventListener("change", () => {
      renderAdminView(statistics, reports);
    });
  });
}

function connectStatusUpdate(statistics, reports) {
  const confirmButton = document.querySelector(".confirm-button");
  if (!confirmButton) {
    return;
  }

  const reportId = new URLSearchParams(window.location.search).get("id") || "MC-024";
  const report = reports.find((item) => item.id === reportId);
  if (!report) {
    confirmButton.disabled = true;
    window.AdminUI.showAdminError(`No se encontró el reporte ${reportId}.`);
    return;
  }
  window.AdminUI.renderReportDetails(report);

  confirmButton.addEventListener("click", async () => {
    const selected = document.querySelector('input[name="report-status"]:checked');
    const discardReason = document.querySelector("#discard-reason");
    if (!selected) {
      showUpdateFeedback("Selecciona un estado antes de continuar.", true);
      return;
    }
    if (selected.value === "descartado" && !discardReason.value.trim()) {
      showUpdateFeedback("Escribe una razón antes de descartar el reporte.", true);
      discardReason.focus();
      return;
    }

    const updatedReports = reports.map((item) => (
      item.id === reportId ? { ...item, estado: selected.value } : item
    ));

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      localStorage.setItem(adminStorageKey, JSON.stringify(updatedReports));
      reports.splice(0, reports.length, ...updatedReports);
      window.AdminUI.renderReportDetails(reports.find((item) => item.id === reportId));
      renderAdminView(statistics, reports);
      const stateLabel = document.querySelector(".current-status strong").textContent;
      showUpdateFeedback(`Estado actualizado a «${stateLabel}». El cambio se guardó en este navegador.`);
      window.AdminUI.clearAdminError();
    } catch (error) {
      console.error("No se pudo guardar el estado del reporte.", error);
      showUpdateFeedback("No se pudo guardar el cambio en el almacenamiento local.", true);
    }
  });
}

async function initializeAdminService() {
  try {
    const { statistics, reports } = await loadAdminData();
    window.AdminUI.clearAdminError();
    populateCategoryFilter(reports);
    connectReportFilters(statistics, reports);
    connectStatusUpdate(statistics, reports);
    renderAdminView(statistics, reports);
  } catch (error) {
    console.error("No se pudo inicializar el módulo de administración.", error);
    window.AdminUI.showAdminError(`No se pudieron cargar los datos de administración: ${error.message}`);
  }
}

initializeAdminService();
