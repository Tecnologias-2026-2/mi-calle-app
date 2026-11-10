const tablaBody = document.querySelector(".tabla-reportes tbody");

function escapeReportHTML(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function getStatus(report) {
    const key = String(report.estado_atencion || report.estado || "reportado").toLowerCase();
    const statuses = {
        reportado: ["Reportado", "estado-azul"],
        pendiente: ["Pendiente", "estado-rojo"],
        "en revisión": ["En revisión", "estado-rojo"],
        en_revision: ["En revisión", "estado-rojo"],
        "en proceso": ["En proceso", "estado-amarillo"],
        resuelto: ["Resuelto", "estado-verde"],
        reparado: ["Reparado", "estado-verde"]
    };
    return statuses[key] || statuses.reportado;
}

function formatDate(report) {
    const value = report.fecha_creacion || report.created_at || report.fecha;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
}

function renderSummary(reports) {
    const counts = {
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
    Object.entries(counts).forEach(([key, value]) => {
        document.querySelector(`[data-report-count="${key}"]`).textContent = value;
    });
}

function renderRows(reports) {
    if (!reports.length) {
        tablaBody.innerHTML = `<tr><td colspan="4"><div class="estado-vacio">
            <strong>Aún no has creado ningún reporte</strong>
            <span>Cuando informes un problema de tu comunidad, aparecerá aquí.</span>
            <a href="reportar.html">Crear reporte</a>
        </div></td></tr>`;
        return;
    }

    tablaBody.replaceChildren(...reports.map((report) => {
        const [label, className] = getStatus(report);
        const title = report.tipo_problema || report.categoria || report.tipo || "Reporte ciudadano";
        const location = report.direccion_texto || report.ubicacion || "Sin ubicación";
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeReportHTML(title)}</td>
            <td>${escapeReportHTML(location)}</td>
            <td>${escapeReportHTML(formatDate(report))}</td>
            <td><span class="estado ${className}">${label}</span></td>`;
        return row;
    }));
}

async function loadMyReports() {
    try {
        const response = await MiCalleAuth.request("/reportes?mine=true");
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
        if (!Array.isArray(data)) throw new Error("La respuesta del servidor no contiene reportes.");
        renderSummary(data);
        renderRows(data);
    } catch (error) {
        console.error("No se pudieron cargar los reportes del usuario:", error);
        tablaBody.innerHTML = `<tr><td colspan="4">No se pudieron cargar tus reportes. Intenta nuevamente.</td></tr>`;
    }
}

loadMyReports();
