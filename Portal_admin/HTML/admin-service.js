function populateCategoryFilter(reports) {
  const categoryFilter = document.querySelector("#report-category-filter");
  if (!categoryFilter) return;

  const categories = [...new Set(reports.map((report) => report.type))]
    .sort((first, second) => first.localeCompare(second, "es"));
  categoryFilter.replaceChildren(new Option("Todas", ""));
  categories.forEach((category) => categoryFilter.add(new Option(category, category)));
}

function normalizeStatus(status) {
  return ({
    proceso: "en_proceso",
    resuelto: "reparado",
  })[status] || status;
}

function getFilteredReports(reports) {
  const search = document.querySelector("#report-search")?.value.trim().toLocaleLowerCase("es") || "";
  const status = document.querySelector("#report-status-filter")?.value || "";
  const category = document.querySelector("#report-category-filter")?.value || "";

  return reports.filter((report) => {
    const searchableText = [
      report.id,
      report.type,
      report.location.address,
      report.reporter?.name,
      report.description,
    ].join(" ").toLocaleLowerCase("es");
    return (!search || searchableText.includes(search))
      && (!status || normalizeStatus(report.status) === normalizeStatus(status))
      && (!category || report.type === category);
  });
}

function renderAdminView(statistics, reports) {
  window.AdminUI.renderKpis(statistics, reports);
  window.AdminUI.renderPeriodSummary(reports, document.querySelector("#dashboard-period-filter")?.value);
  window.AdminUI.renderStatusSummary(reports);
  window.AdminUI.renderCategorySummary(reports);
  window.AdminUI.renderReports(getFilteredReports(reports), reports.length);
}

function showUpdateFeedback(message, isError = false) {
  const feedback = document.querySelector(".update-feedback");
  if (!feedback) return;
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

function connectStatusUpdate(reports, refreshReports) {
  const confirmButton = document.querySelector(".confirm-button");
  if (!confirmButton) return;

  const reportId = new URLSearchParams(window.location.search).get("id");
  if (!reportId) {
    confirmButton.disabled = true;
    window.AdminUI.showAdminError("Selecciona un reporte desde la lista para consultar sus detalles.");
    return;
  }
  const report = reports.find((item) => item.id === reportId);
  if (!report) {
    confirmButton.disabled = true;
    window.AdminUI.showAdminError(`No se encontró el reporte ${reportId}.`);
    return;
  }
  window.AdminUI.renderReportDetails(report);

  confirmButton.addEventListener("click", async () => {
    if (confirmButton.disabled) return;
    const selected = document.querySelector('input[name="report-status"]:checked');
    if (!selected) {
      showUpdateFeedback("Selecciona un estado antes de continuar.", true);
      return;
    }

    confirmButton.disabled = true;
    confirmButton.setAttribute("aria-busy", "true");
    const idleButtonContent = confirmButton.innerHTML;
    confirmButton.innerHTML = '<span class="loading-spinner loading-spinner--light" aria-hidden="true"></span> Guardando cambio...';
    try {
      const observation = document.querySelector("#status-note")?.value.trim() || "";
      await window.MiCalleServices.saveAdminObservation(reportId, observation, selected.value);
      refreshReports(await window.MiCalleServices.getAdminReports());
      const stateLabel = document.querySelector(".current-status strong").textContent;
      showUpdateFeedback(`Estado actualizado a «${stateLabel}».`);
      window.AdminUI.clearAdminError();
    } catch (error) {
      console.error("No se pudo guardar el cambio administrativo.", error);
      showUpdateFeedback(error.message || "No se pudo guardar el cambio.", true);
    } finally {
      confirmButton.innerHTML = idleButtonContent;
      confirmButton.disabled = false;
      confirmButton.setAttribute("aria-busy", "false");
    }
  });
}

function showAdminGate(message, provider) {
  const content = document.querySelector(".dashboard-content");
  if (!content) return;
  const notice = document.createElement("section");
  notice.className = "panel";
  const title = document.createElement("h1");
  title.textContent = provider === "demo"
    ? "Panel administrativo de demostración"
    : "Acceso administrativo";
  const description = document.createElement("p");
  description.textContent = message;
  const login = document.createElement("a");
  login.href = provider === "demo"
    ? "../../login-registro/html/login-admin.html?demo=1"
    : "../../login-registro/html/login-admin.html";
  login.textContent = provider === "demo"
    ? "Acceder como administrador demo"
    : "Iniciar sesión como administrador";
  notice.append(title, description, login);
  content.replaceChildren(notice);
}

async function initializeAdminService() {
  try {
    const provider = window.MiCalleServices.provider;
    const session = window.MiCalleServices.getCurrentSession();
    if (session?.user.role !== "administrador") {
      showAdminGate(
        provider === "demo"
          ? "La sesión de administrador demo no está activa. Este flujo no representa autorización real."
          : "Inicia sesión con una cuenta cuyo rol sea administrador.",
        provider,
      );
      return;
    }

    const adminName = document.querySelector(".user-copy strong");
    const adminRole = document.querySelector(".user-copy small");
    if (adminName) adminName.textContent = session.user.name || "Administrador";
    if (adminRole) adminRole.textContent = provider === "demo" ? "Datos locales" : "Administrador";
    document.querySelector(".logout-button")?.addEventListener("click", () => {
      window.MiCalleServices.logout();
    });

    window.AdminUI.showAdminLoading();
    const reports = await window.MiCalleServices.getAdminReports();
    const statistics = await window.MiCalleServices.getAdminStatistics(reports);
    window.AdminUI.clearAdminLoading();
    const refreshReports = (nextReports) => {
      reports.splice(0, reports.length, ...nextReports);
      populateCategoryFilter(reports);
      renderAdminView(statistics, reports);
      const reportId = new URLSearchParams(window.location.search).get("id");
      const report = reports.find((item) => item.id === reportId);
      if (report) window.AdminUI.renderReportDetails(report);
    };

    window.AdminUI.clearAdminError();
    populateCategoryFilter(reports);
    connectReportFilters(statistics, reports);
    connectStatusUpdate(reports, refreshReports);
    document.querySelector("#dashboard-period-filter")?.addEventListener("change", () => {
      renderAdminView(statistics, reports);
    });
    window.MiCalleServices.subscribeAdminReports(refreshReports);
    renderAdminView(statistics, reports);
  } catch (error) {
    console.error("No se pudo inicializar el módulo administrativo.", error);
    window.AdminUI.clearAdminLoading();
    window.AdminUI.showAdminError(`No se pudieron cargar los datos administrativos: ${error.message}`);
  }
}

initializeAdminService();
