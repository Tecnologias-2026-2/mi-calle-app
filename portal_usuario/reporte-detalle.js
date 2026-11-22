const reportId = new URLSearchParams(window.location.search).get("id");
const loading = document.querySelector("#detalle-cargando");
const content = document.querySelector("#detalle-contenido");

const statusLabels = {
    pendiente: "Pendiente",
    en_revision: "En revisión",
    en_proceso: "En proceso",
    reparado: "Reparado",
    descartado: "Descartado"
};

const formatReportType = window.MiCalleReportFormatters.formatCategory;

function formatStatus(status) {
    return statusLabels[status] || "Estado actualizado";
}

function formatDate(value, includeTime = false) {
    if (!value) return "Fecha no disponible";
    const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const dateValue = dateOnly ? `${value}T12:00:00` : value;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return date.toLocaleString("es-CO", includeTime && !dateOnly
        ? { dateStyle: "medium", timeStyle: "short" }
        : { dateStyle: "long" });
}

function configureNavigation() {
    const session = window.MiCalleServices.getCurrentSession();
    const isAdmin = session?.user?.role?.toLocaleLowerCase("es") === "administrador";
    const portalLink = document.querySelector("#detalle-nav-portal");
    const loginLink = document.querySelector("#detalle-nav-login");
    const logoutButton = document.querySelector("#detalle-cerrar-sesion");
    const backLink = document.querySelector("#detalle-volver");
    const backLabel = backLink.querySelector("span");

    if (session) {
        portalLink.hidden = false;
        portalLink.href = isAdmin ? "../../Portal_admin/HTML/index.html" : "index.html";
        portalLink.textContent = isAdmin ? "Panel admin" : "Mi portal";
        loginLink.hidden = true;
        logoutButton.hidden = false;
        document.querySelector("#detalle-marca-contexto").textContent =
            isAdmin ? "Panel administrativo" : "Portal ciudadano";
    }

    let referrer = null;
    if (document.referrer) {
        const candidate = new URL(document.referrer);
        if (candidate.origin === window.location.origin
            && candidate.pathname !== window.location.pathname) {
            referrer = `${candidate.pathname}${candidate.search}${candidate.hash}`;
        }
    }

    if (referrer) {
        backLink.href = referrer;
        backLabel.textContent = "Volver";
    } else if (session && isAdmin) {
        backLink.href = "../../Portal_admin/HTML/index.html";
        backLabel.textContent = "Volver al panel";
    } else if (session) {
        backLink.href = "index.html";
        backLabel.textContent = "Volver a mi portal";
    } else {
        backLink.href = "mapa.html";
        backLabel.textContent = "Volver al mapa";
    }

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        try {
            await window.MiCalleServices.logout();
            window.location.assign("../../login-registro/html/landing.html");
        } catch (error) {
            console.error("No se pudo cerrar la sesión.", error);
            logoutButton.disabled = false;
            alert(error.message || "No se pudo cerrar la sesión.");
        }
    });
}

function renderHistory(entries) {
    const list = document.querySelector("#historial-estados");
    if (!Array.isArray(entries) || !entries.length) {
        const empty = document.createElement("li");
        empty.className = "detalle-timeline-vacio";
        empty.textContent = "El historial no está disponible para este reporte.";
        list.replaceChildren(empty);
        return;
    }

    list.replaceChildren(...entries.map((entry) => {
        const item = document.createElement("li");
        item.className = `detalle-timeline-item detalle-timeline-item--${entry.status}`;

        const marker = document.createElement("span");
        marker.className = "detalle-timeline-marcador";
        marker.setAttribute("aria-hidden", "true");

        const body = document.createElement("div");
        body.className = "detalle-timeline-contenido";

        const heading = document.createElement("div");
        heading.className = "detalle-timeline-cabecera";
        const status = document.createElement("strong");
        status.textContent = formatStatus(entry.status);
        const time = document.createElement("time");
        time.textContent = formatDate(entry.changedAt, true);
        if (entry.changedAt) time.dateTime = entry.changedAt;
        heading.append(status, time);
        body.append(heading);

        const observation = String(entry.observation || "").trim();
        if (observation) {
            const note = document.createElement("p");
            note.className = "detalle-timeline-observacion";
            note.textContent = observation;
            body.append(note);
        }

        item.append(marker, body);
        return item;
    }));
}

function renderDiscardNotice(report) {
    const notice = document.querySelector("#detalle-descartado-aviso");
    if (report.status !== "descartado") {
        notice.hidden = true;
        notice.replaceChildren();
        return;
    }

    const history = Array.isArray(report.history) ? report.history : [];
    const observationText = [...history].reverse().find((entry) => (
        entry.status === "descartado" && String(entry.observation || "").trim()
    ))?.observation
        || [...history].reverse().find((entry) => String(entry.observation || "").trim())?.observation
        || "No se registró una observación.";
    const heading = document.createElement("strong");
    heading.textContent = "Reporte descartado";
    const observation = document.createElement("p");
    observation.textContent = `Observación del equipo administrador: ${observationText}`;
    const explanation = document.createElement("p");
    explanation.textContent = "Este reporte fue descartado por el equipo administrador y será eliminado automáticamente 24 horas después de su revisión.";
    notice.replaceChildren(heading, observation, explanation);
    notice.hidden = false;
}

function renderReport(report) {
    if (!report) throw new Error("No se encontró el reporte solicitado.");
    loading.hidden = true;
    content.hidden = false;

    const title = formatReportType(report.type) || "Reporte ciudadano";
    document.querySelector("#detalle-titulo").textContent = title;
    const status = document.querySelector("#detalle-estado");
    const normalizedStatus = statusLabels[report.status] ? report.status : "pendiente";
    const statusIcon = document.createElement("i");
    statusIcon.className = "fa-solid fa-circle";
    statusIcon.setAttribute("aria-hidden", "true");
    status.replaceChildren(statusIcon, document.createTextNode(formatStatus(report.status)));
    status.className = `detalle-estado detalle-estado--${normalizedStatus}`;
    renderDiscardNotice(report);

    document.querySelector("#detalle-ubicacion").textContent =
        report.location.address || "Ubicación no disponible";
    document.querySelector("#detalle-fecha").textContent = formatDate(report.createdAt);
    document.querySelector("#detalle-descripcion").textContent =
        String(report.description || "").trim() || "Este reporte no incluye una descripción.";

    const coordinates = document.querySelector("#detalle-coordenadas");
    const latitude = Number(report.location.latitude);
    const longitude = Number(report.location.longitude);
    if (report.location.latitude != null && report.location.longitude != null
        && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        document.querySelector("#detalle-coordenadas-valor").textContent =
            `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        coordinates.hidden = false;
    } else {
        document.querySelector("#detalle-coordenadas-valor").textContent = "";
        coordinates.hidden = true;
    }

    const photo = document.querySelector("#detalle-fotografia");
    const photoUrl = report.photo?.url;
    photo.hidden = !photoUrl;
    photo.src = photoUrl || "";
    photo.alt = `Fotografía del reporte: ${title}`;
    document.querySelector("#detalle-sin-fotografia").hidden = Boolean(photoUrl);
    renderHistory(report.history);
}

async function loadReport() {
    if (!reportId) throw new Error("Falta el identificador del reporte.");
    const report = await window.MiCalleServices.getReportById(reportId);
    if (!report) throw new Error("No se encontró el reporte solicitado.");
    const hasDiscardObservation = report.status === "descartado"
        && report.history?.some((entry) => (
            entry.status === "descartado" && String(entry.observation || "").trim()
        ));
    if (!hasDiscardObservation) {
        report.history = await window.MiCalleServices.getReportHistory(reportId);
    }
    renderReport(report);
    const session = window.MiCalleServices.getCurrentSession();
    const isAdmin = session?.user?.role?.toLocaleLowerCase("es") === "administrador";
    const subscribe = isAdmin
        ? window.MiCalleServices.subscribeAdminReports
        : session
            ? window.MiCalleServices.subscribeUserReports
            : window.MiCalleServices.subscribePublicReports;
    subscribe(async (reports) => {
        const updated = reports.find((item) => item.id === reportId);
        if (!updated) return;
        try {
            updated.history = await window.MiCalleServices.getReportHistory(reportId);
            renderReport(updated);
        } catch (error) {
            console.error("No se pudo actualizar el historial del reporte.", error);
        }
    }, (error) => {
        console.error("No se pudo actualizar el detalle del reporte.", error);
    });
}

try {
    configureNavigation();
} catch (error) {
    console.error("No se pudo configurar la navegación del reporte.", error);
}

loadReport().catch((error) => {
    console.error("No se pudo cargar el detalle del reporte.", error);
    loading.textContent = error.message || "No se pudo cargar el reporte.";
});
