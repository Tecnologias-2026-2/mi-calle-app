const reportStatus = {
    pendiente: { label: "Pendiente", className: "estado-pendiente" },
    en_revision: { label: "En revisión", className: "estado-revision" },
    en_proceso: { label: "En proceso", className: "estado-proceso" },
    reparado: { label: "Reparado", className: "estado-reparado" },
    descartado: { label: "Descartado", className: "estado-descartado" }
};
const formatReportCategory = window.MiCalleReportFormatters.formatCategory;

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function getReportStatus(report) {
    return reportStatus[report.status] || reportStatus.pendiente;
}

function reportTitle(report) {
    return formatReportCategory(report.type);
}

function reportDate(report) {
    const value = report.createdAt;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
}

function latestObservation(report) {
    if (String(report.latestObservation || "").trim()) return report.latestObservation.trim();
    const history = Array.isArray(report.history) ? report.history : [];
    return [...history].reverse()
        .find((entry) => String(entry.observation || "").trim())?.observation.trim() || "";
}

function discardedObservation(report) {
    const history = Array.isArray(report.history) ? report.history : [];
    return [...history].reverse().find((entry) => (
        entry.status === "descartado" && String(entry.observation || "").trim()
    ))?.observation || latestObservation(report) || "No se registró una observación.";
}

function createDiscardNotice(report) {
    const notice = document.createElement("aside");
    notice.className = "reporte-descartado-aviso";
    notice.setAttribute("role", "note");
    const heading = document.createElement("strong");
    heading.textContent = "Reporte descartado";
    const observation = document.createElement("p");
    observation.textContent = `Observación del equipo administrador: ${discardedObservation(report)}`;
    const explanation = document.createElement("p");
    explanation.textContent = "Este reporte fue descartado por el equipo administrador y será eliminado automáticamente 24 horas después de su revisión.";
    notice.append(heading, observation, explanation);
    return notice;
}

function countReports(reports) {
    return {
        total: reports.length,
        reportado: reports.filter((report) => report.status === "pendiente").length,
        proceso: reports.filter((report) => ["en_revision", "en_proceso"].includes(report.status)).length,
        resuelto: reports.filter((report) => report.status === "reparado").length
    };
}

function renderReportStats(reports) {
    const counts = countReports(reports);
    Object.entries(counts).forEach(([key, value]) => {
        document.querySelectorAll(`[data-report-count="${key}"]`).forEach((element) => {
            element.textContent = value;
        });
    });
}

function renderRecentReports(reports) {
    document.querySelectorAll("[data-recent-reports]").forEach((container) => {
        if (!reports.length) {
            container.innerHTML = `<div class="estado-vacio">
                <strong>Aún no has creado ningún reporte</strong>
                <span>Cuando informes un problema de tu comunidad, aparecerá aquí.</span>
                <a class="btn-guardar" href="reportar.html">Crear reporte</a>
            </div>`;
            return;
        }

        container.replaceChildren(...reports.slice(0, 4).map((report) => {
            const status = getReportStatus(report);
            const item = document.createElement("div");
            item.className = "item-actividad-inicio";
            item.innerHTML = `
                <div class="icono-act-inicio ${status.className.replace("estado-", "")}">
                    <i class="fa-solid fa-file-lines"></i>
                </div>
                <div class="info-act-inicio">
                    <strong>${escapeHTML(reportTitle(report))}</strong>
                    <span>${escapeHTML(reportDate(report))}</span>
                </div>
                <span class="estado ${status.className}">${status.label}</span>`;
            const observation = latestObservation(report);
            if (report.status === "descartado") {
                item.querySelector(".info-act-inicio").append(createDiscardNotice(report));
            } else if (observation) {
                const note = document.createElement("small");
                note.className = "observacion-reporte";
                note.textContent = `Última actualización: ${observation}`;
                item.querySelector(".info-act-inicio").append(note);
            }
            return item;
        }));
    });
}

function setReportsLoading(message, { spinner = false } = {}) {
    document.querySelectorAll("[data-reports-loading]").forEach((element) => {
        element.hidden = false;
        element.setAttribute("role", "status");
        element.setAttribute("aria-busy", String(spinner));
        if (spinner) {
            const indicator = document.createElement("span");
            indicator.className = "loading-spinner";
            indicator.setAttribute("aria-hidden", "true");
            element.replaceChildren(indicator, document.createTextNode(message));
        } else {
            element.textContent = message;
        }
    });
}

function renderUserReports(data) {
    document.querySelectorAll("[data-reports-loading]").forEach((element) => {
        element.hidden = true;
        element.setAttribute("aria-busy", "false");
    });
    renderReportStats(data);
    renderRecentReports(data);
}

function showReportsError(error) {
    console.error("No se pudieron cargar los reportes del usuario:", error);
    setReportsLoading("No se pudieron cargar tus reportes. Intenta nuevamente.");
    document.querySelectorAll("[data-recent-reports]").forEach((element) => {
        element.innerHTML = `<div class="estado-vacio">
            <strong>No pudimos cargar tus reportes</strong>
            <span>Intenta nuevamente más tarde.</span>
        </div>`;
    });
}

setReportsLoading(" Cargando tus reportes...", { spinner: true });
MiCalleServices.subscribeUserReports(renderUserReports, showReportsError);
