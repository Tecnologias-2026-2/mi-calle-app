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
    const latitud = Number(reporte.latitud);
    const longitud = Number(reporte.longitud);
    const ubicacion = Number.isFinite(latitud) && Number.isFinite(longitud)
        ? `<a href="https://www.google.com/maps?q=${latitud},${longitud}" target="_blank" rel="noopener">${escaparHTML(reporte.direccion_texto || "Ver ubicación")} <i class="fa-solid fa-map-location-dot"></i></a>`
        : escaparHTML(reporte.direccion_texto || reporte.ubicacion || "Sin ubicación");
    const foto = reporte.foto_url || reporte.imagen_url || reporte.foto;
    fila.innerHTML = `
        <td>${escaparHTML(reporte.tipo_problema || reporte.categoria || "Sin tipo")}</td>
        <td>${ubicacion}${foto ? ` <a href="${escaparHTML(foto)}" target="_blank" rel="noopener" aria-label="Ver foto del reporte"><i class="fa-regular fa-image"></i></a>` : ""}</td>
        <td>${formatearFecha(reporte.fecha_creacion)}</td>
        <td><span class="estado ${estado.clase}">${estado.label}</span></td>
    `;
    return fila;
}

function escaparHTML(valor) {
    const contenedor = document.createElement("div");
    contenedor.textContent = valor;
    return contenedor.innerHTML;
}

function mostrarEstadoVacio() {
    tablaBody.innerHTML = `
        <tr><td colspan="4">
            <div class="estado-vacio">
                <strong>Aún no tienes reportes</strong>
                <span>Cuando informes un problema de tu comunidad, aparecerá aquí.</span>
                <a href="reportar.html">Crear reporte</a>
            </div>
        </td></tr>`;
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
        const respuesta = await MiCalleAuth.request("/reportes?mine=true");
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
            throw new Error(datos.error || `Error HTTP ${respuesta.status}`);
        }
        if (!Array.isArray(datos)) {
            throw new Error("La respuesta del servidor no contiene reportes.");
        }

        if (datos.length === 0) {
            mostrarEstadoVacio();
        } else {
            tablaBody.replaceChildren(...datos.map(crearFila));
        }
        actualizarResumen(datos);
    } catch (error) {
        tablaBody.innerHTML = `<tr><td colspan="4">${escaparHTML(error.message)}</td></tr>`;
    }
}

cargarMisReportes();
