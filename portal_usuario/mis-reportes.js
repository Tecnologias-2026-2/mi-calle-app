const tablaBody = document.querySelector(".tabla-reportes tbody");
const formatReportCategory = window.MiCalleReportFormatters.formatCategory;

function escapeReportHTML(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function getStatus(report) {
    const statuses = {
        pendiente: ["Pendiente", "estado-pendiente"],
        en_revision: ["En revisión", "estado-revision"],
        en_proceso: ["En proceso", "estado-proceso"],
        reparado: ["Reparado", "estado-reparado"],
        descartado: ["Descartado", "estado-descartado"]
    };
    return statuses[report.status] || statuses.pendiente;
}

function formatDate(report) {
    const value = report.createdAt;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
}

function latestObservation(report) {
    const history = Array.isArray(report.history) ? report.history : [];
    return [...history].reverse().find((entry) => entry.observation)?.observation || "";
}

function createDiscardNotice(report) {
    const history = Array.isArray(report.history) ? report.history : [];
    const observationText = [...history].reverse().find((entry) => (
        entry.status === "descartado" && String(entry.observation || "").trim()
    ))?.observation || latestObservation(report) || "No se registró una observación.";
    const notice = document.createElement("aside");
    notice.className = "reporte-descartado-aviso";
    notice.setAttribute("role", "note");
    const heading = document.createElement("strong");
    heading.textContent = "Reporte descartado";
    const observation = document.createElement("p");
    observation.textContent = `Observación del equipo administrador: ${observationText}`;
    const explanation = document.createElement("p");
    explanation.textContent = "Este reporte fue descartado por el equipo administrador y será eliminado automáticamente 24 horas después de su revisión.";
    notice.append(heading, observation, explanation);
    return notice;
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
    tablaBody.setAttribute("aria-busy", "false");
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
        const title = formatReportCategory(report.type);
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
        const titleCell = row.querySelector("td");
        titleCell.append(detailLink);
        const observation = latestObservation(report);
        if (report.status === "descartado") {
            titleCell.append(createDiscardNotice(report));
        } else if (observation) {
            const note = document.createElement("small");
            note.className = "observacion-reporte";
            note.textContent = `Última actualización: ${observation}`;
            titleCell.append(note);
        }
        return row;
    }));
}

async function loadMyReports() {
    tablaBody.setAttribute("aria-busy", "true");
    const loading = document.createElement("span");
    loading.className = "loading-spinner";
    loading.setAttribute("aria-hidden", "true");
    const message = document.createElement("span");
    message.textContent = "Cargando tus reportes...";
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "loading-cell";
    cell.append(loading, message);
    const row = document.createElement("tr");
    row.append(cell);
    tablaBody.replaceChildren(row);
    try {
        const data = await MiCalleServices.getMyReports();
        renderSummary(data);
        renderRows(data);
    } catch (error) {
        console.error("No se pudieron cargar los reportes del usuario:", error);
        tablaBody.setAttribute("aria-busy", "false");
        tablaBody.innerHTML = `<tr><td colspan="4">No se pudieron cargar tus reportes. Intenta nuevamente.</td></tr>`;
    }
}

loadMyReports();
MiCalleServices.subscribeMyReports((reports) => {
    renderSummary(reports);
    renderRows(reports);
});
