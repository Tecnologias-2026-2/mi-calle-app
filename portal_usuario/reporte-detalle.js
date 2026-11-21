const reportId = new URLSearchParams(window.location.search).get("id");
const loading = document.querySelector("#detalle-cargando");
const content = document.querySelector("#detalle-contenido");

function renderHistory(entries) {
    const list = document.querySelector("#historial-estados");
    if (!Array.isArray(entries) || !entries.length) {
        const empty = document.createElement("li");
        empty.textContent = "El historial no está disponible para este reporte.";
        list.replaceChildren(empty);
        return;
    }

    list.replaceChildren(...entries.map((entry) => {
        const item = document.createElement("li");
        const status = ({
            pendiente: "Pendiente",
            en_revision: "En revisión",
            en_proceso: "En proceso",
            reparado: "Reparado"
        })[entry.status] || entry.status;
        const parsedDate = entry.changedAt ? new Date(entry.changedAt) : null;
        const date = parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toLocaleString("es-CO")
            : "Fecha no disponible";
        const note = entry.observation ? ` — ${entry.observation}` : "";
        item.textContent = `${status} · ${date}${note}`;
        return item;
    }));
}

function renderReport(report) {
    if (!report) throw new Error("No se encontró el reporte solicitado.");
    loading.hidden = true;
    content.hidden = false;
    document.querySelector("#detalle-titulo").textContent = report.type || "Reporte ciudadano";
    document.querySelector("#detalle-estado").textContent = report.status;
    document.querySelector("#detalle-ubicacion").textContent = report.location.address || "Ubicación no disponible";
    const dateValue = report.createdAt;
    document.querySelector("#detalle-fecha").textContent =
        dateValue ? new Date(dateValue).toLocaleDateString("es-CO") : "Fecha no disponible";
    document.querySelector("#detalle-descripcion").textContent =
        report.description || "Sin descripción.";

    const photo = document.querySelector("#detalle-fotografia");
    const photoUrl = report.photo.url;
    photo.hidden = !photoUrl;
    photo.src = photoUrl || "";
    document.querySelector("#detalle-sin-fotografia").hidden = Boolean(photoUrl);

    const latitude = Number(report.location.latitude);
    const longitude = Number(report.location.longitude);
    const coordinates = document.querySelector("#detalle-coordenadas");
    if (report.location.latitude != null && report.location.longitude != null
        && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        coordinates.hidden = false;
        coordinates.textContent = `Coordenadas: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
    renderHistory(report.history);
}

async function loadReport() {
    if (!reportId) throw new Error("Falta el identificador del reporte.");
    const report = await window.MiCalleServices.getReportById(reportId);
    if (!report) throw new Error("No se encontró el reporte solicitado.");
    report.history = await window.MiCalleServices.getReportHistory(reportId);
    renderReport(report);
    window.MiCalleServices.subscribePublicReports((reports) => {
        const updated = reports.find((item) => item.id === reportId);
        if (updated) renderReport(updated);
    });
}

loadReport().catch((error) => {
    console.error("No se pudo cargar el detalle del reporte.", error);
    loading.textContent = error.message || "No se pudo cargar el reporte.";
});
