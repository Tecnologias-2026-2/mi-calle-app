const reportStatus = {
    pendiente: { label: "Pendiente", className: "estado-rojo" },
    en_revision: { label: "En revisión", className: "estado-rojo" },
    en_proceso: { label: "En proceso", className: "estado-amarillo" },
    reparado: { label: "Reparado", className: "estado-verde" }
};

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function getReportStatus(report) {
    return reportStatus[report.status] || reportStatus.pendiente;
}

function reportTitle(report) {
    return report.type || "Reporte ciudadano";
}

function reportDate(report) {
    const value = report.createdAt;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
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
            return item;
        }));
    });
}

async function loadUserReports() {
    document.querySelectorAll("[data-reports-loading]").forEach((element) => {
        element.hidden = false;
        element.textContent = "Cargando...";
    });
    const data = await MiCalleServices.getMyReports();
    document.querySelectorAll("[data-reports-loading]").forEach((element) => { element.hidden = true; });
    renderReportStats(data);
    renderRecentReports(data);
    return data;
}

function showReportsError(error) {
    console.error("No se pudieron cargar los reportes del usuario:", error);
    document.querySelectorAll("[data-reports-loading]").forEach((element) => {
        element.hidden = false;
        element.textContent = "No se pudieron cargar tus reportes. Intenta nuevamente.";
    });
    document.querySelectorAll("[data-recent-reports]").forEach((element) => {
        element.innerHTML = `<div class="estado-vacio">
            <strong>No pudimos cargar tus reportes</strong>
            <span>Intenta nuevamente más tarde.</span>
        </div>`;
    });
}

loadUserReports().catch(showReportsError);
MiCalleServices.subscribeMyReports((reports) => {
    renderReportStats(reports);
    renderRecentReports(reports);
});
