const reportStatus = {
    reportado: { label: "Reportado", className: "estado-azul" },
    pendiente: { label: "Pendiente", className: "estado-rojo" },
    "en revisión": { label: "En revisión", className: "estado-rojo" },
    en_revision: { label: "En revisión", className: "estado-rojo" },
    "en proceso": { label: "En proceso", className: "estado-amarillo" },
    resuelto: { label: "Resuelto", className: "estado-verde" },
    reparado: { label: "Reparado", className: "estado-verde" }
};

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function getReportStatus(report) {
    const key = String(report.estado_atencion || report.estado || "reportado").toLowerCase();
    return reportStatus[key] || reportStatus.reportado;
}

function reportTitle(report) {
    return report.tipo_problema || report.categoria || report.tipo || "Reporte ciudadano";
}

function reportDate(report) {
    const value = report.fecha_creacion || report.created_at || report.fecha;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
}

function countReports(reports) {
    return {
        total: reports.length,
        reportado: reports.filter((report) => ["reportado", "pendiente"].includes(
            String(report.estado_atencion || report.estado || "").toLowerCase()
        )).length,
        proceso: reports.filter((report) => ["en revisión", "en_revision", "en proceso"].includes(
            String(report.estado_atencion || report.estado || "").toLowerCase()
        )).length,
        resuelto: reports.filter((report) => ["resuelto", "reparado"].includes(
            String(report.estado_atencion || report.estado || "").toLowerCase()
        )).length
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
    const response = await MiCalleAuth.request("/reportes?mine=true");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
    if (!Array.isArray(data)) throw new Error("La respuesta del servidor no contiene reportes.");
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
