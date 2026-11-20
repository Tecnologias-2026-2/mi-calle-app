const tablaBody = document.querySelector(".tabla-reportes tbody");

function escapeReportHTML(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function getStatus(report) {
    const statuses = {
        pendiente: ["Pendiente", "estado-rojo"],
        en_revision: ["En revisión", "estado-rojo"],
        en_proceso: ["En proceso", "estado-amarillo"],
        reparado: ["Reparado", "estado-verde"]
    };
    return statuses[report.status] || statuses.pendiente;
}

function formatDate(report) {
    const value = report.createdAt;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
}

function renderSummary(reports) {
    const counts = {
        total: reports.length,
        reportado: reports.filter((report) => report.status === "pendiente").length,
        proceso: reports.filter((report) => ["en_revision", "en_proceso"].includes(report.status)).length,
        resuelto: reports.filter((report) => report.status === "reparado").length
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
            <a class="btn-guardar" href="reportar.html">Crear mi primer reporte</a>
        </div></td></tr>`;
        return;
    }

    tablaBody.replaceChildren(...reports.map((report) => {
        const [label, className] = getStatus(report);
        const title = report.type || "Reporte ciudadano";
        const location = report.location.address || "Sin ubicación";
        const detailLink = document.createElement("a");
        detailLink.href = `reporte-detalle.html?id=${encodeURIComponent(report.id)}`;
        detailLink.textContent = title;
        detailLink.setAttribute("aria-label", `Ver detalle de ${title}`);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td></td>
            <td>${escapeReportHTML(location)}</td>
            <td>${escapeReportHTML(formatDate(report))}</td>
            <td><span class="estado ${className}">${label}</span></td>`;
        row.querySelector("td").append(detailLink);
        return row;
    }));
}

async function loadMyReports() {
    tablaBody.innerHTML = '<tr><td colspan="4">Cargando tus reportes...</td></tr>';
    try {
        const data = await MiCalleServices.getMyReports();
        renderSummary(data);
        renderRows(data);
    } catch (error) {
        console.error("No se pudieron cargar los reportes del usuario:", error);
        tablaBody.innerHTML = `<tr><td colspan="4">No se pudieron cargar tus reportes. Intenta nuevamente.</td></tr>`;
    }
}

loadMyReports();
MiCalleServices.subscribeMyReports((reports) => {
    renderSummary(reports);
    renderRows(reports);
});
