const BASE_URL = "https://mi-calle-app-backend.onrender.com";
const reportesUrl = `${BASE_URL}/reportes`;
const tablaBody = document.querySelector(".tabla-reportes tbody");
const resumen = {
    total: document.querySelector(".borde-gris .numero-inicio"),
    reportado: document.querySelector(".borde-azul .numero-inicio"),
    proceso: document.querySelector(".borde-amarillo .numero-inicio"),
    resuelto: document.querySelector(".borde-verde .numero-inicio")
};

const estadoConfig = {
    Reportado: { label: "Reportado", clase: "estado-azul" },
    Pendiente: { label: "Pendiente", clase: "estado-rojo" },
    "En revisión": { label: "En revisión", clase: "estado-rojo" },
    "En proceso": { label: "En proceso", clase: "estado-amarillo" },
    Resuelto: { label: "Resuelto", clase: "estado-verde" }
};

function formatearFecha(fecha) {
    if (!fecha) return "Sin fecha";
    return new Date(fecha).toLocaleDateString("es-CO");
}

function crearFila(reporte) {
    const fila = document.createElement("tr");
    const estado = estadoConfig[reporte.estado_atencion] || estadoConfig.Reportado;
    fila.innerHTML = `
        <td>${reporte.tipo_problema || "Sin tipo"}</td>
        <td>${reporte.direccion_texto || "Sin ubicación"}</td>
        <td>${formatearFecha(reporte.fecha_creacion)}</td>
        <td><span class="estado ${estado.clase}">${estado.label}</span></td>
    `;
    return fila;
}

function actualizarResumen(reportes) {
    resumen.total.textContent = reportes.length;
    resumen.reportado.textContent = reportes.filter(
        ({ estado_atencion }) => estado_atencion === "Reportado"
    ).length;
    resumen.proceso.textContent = reportes.filter(
        ({ estado_atencion }) => ["Pendiente", "En revisión", "En proceso"].includes(estado_atencion)
    ).length;
    resumen.resuelto.textContent = reportes.filter(
        ({ estado_atencion }) => estado_atencion === "Resuelto"
    ).length;
}

async function cargarMisReportes() {
    try {
        const respuesta = await fetch(reportesUrl);
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
            throw new Error(datos.error || `Error HTTP ${respuesta.status}`);
        }
        if (!Array.isArray(datos)) {
            throw new Error("La respuesta del servidor no contiene reportes.");
        }

        tablaBody.replaceChildren(...datos.map(crearFila));
        actualizarResumen(datos);
    } catch (error) {
        tablaBody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
        alert(`No se pudieron cargar tus reportes: ${error.message}`);
    }
}

cargarMisReportes();
