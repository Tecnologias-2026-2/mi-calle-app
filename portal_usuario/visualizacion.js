const BOGOTA = [4.711, -74.0721];
const mapa = L.map("mapa").setView(BOGOTA, 13);
const contadorReportes = document.querySelector(".contador-reportes");
const listaReportes = document.querySelector("#lista-reportes-publicos");
const filtroCategoria = document.querySelector("#filtro-categoria");
const filtroEstado = document.querySelector("#filtro-estado");
const marcadores = L.layerGroup().addTo(mapa);
let reportesDisponibles = [];

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapa);

function estadoNormalizado(reporte) {
    return reporte.status;
}

function etiquetaEstado(estado) {
    return ({
        pendiente: "Pendiente",
        en_revision: "En revisión",
        en_proceso: "En proceso",
        reparado: "Reparado"
    })[estado] || "Pendiente";
}

function categoriaReporte(reporte) {
    return reporte.type;
}

function coordenadasReporte(reporte) {
    if (reporte.location.latitude == null || reporte.location.longitude == null) return null;
    const latitud = Number(reporte.location.latitude);
    const longitud = Number(reporte.location.longitude);
    return Number.isFinite(latitud) && Number.isFinite(longitud)
        ? [latitud, longitud]
        : null;
}

function fechaReporte(reporte) {
    const value = reporte.createdAt;
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CO");
}

function prepararFiltroCategorias() {
    const categorias = [...new Set(reportesDisponibles.map(categoriaReporte))]
        .sort((a, b) => a.localeCompare(b, "es"));
    filtroCategoria.replaceChildren(new Option("Todas", ""));
    categorias.forEach((categoria) => filtroCategoria.add(new Option(categoria, categoria)));
}

function reportesFiltrados() {
    const categoria = filtroCategoria.value;
    const estado = filtroEstado.value;
    return reportesDisponibles.filter((reporte) => (
        (!categoria || categoriaReporte(reporte) === categoria)
        && (!estado || estadoNormalizado(reporte) === estado)
    ));
}

function crearDetalleMarcador(reporte) {
    const detalle = document.createElement("div");
    const titulo = document.createElement("strong");
    titulo.textContent = categoriaReporte(reporte);
    const descripcion = document.createElement("p");
    descripcion.textContent = reporte.descripcion || "Sin descripción";
    const enlace = document.createElement("a");
    enlace.href = `reporte-detalle.html?id=${encodeURIComponent(reporte.id)}`;
    enlace.textContent = "Ver detalle e historial";
    detalle.append(titulo, descripcion, enlace);
    return detalle;
}

function renderizarLista(reportes) {
    if (!reportes.length) {
        listaReportes.textContent = "No hay reportes que coincidan con los filtros.";
        return;
    }

    const fragment = document.createDocumentFragment();
    reportes.forEach((reporte) => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "reporte-publico-item";
        const titulo = document.createElement("h3");
        titulo.textContent = categoriaReporte(reporte);
        const direccion = document.createElement("p");
        direccion.textContent = reporte.location.address || "Ubicación por confirmar";
        const estado = document.createElement("span");
        estado.textContent = etiquetaEstado(estadoNormalizado(reporte));
        const enlace = document.createElement("a");
        enlace.href = `reporte-detalle.html?id=${encodeURIComponent(reporte.id)}`;
        enlace.textContent = "Ver detalle";
        tarjeta.append(titulo, direccion, estado, enlace);
        fragment.append(tarjeta);
    });
    listaReportes.replaceChildren(fragment);
}

function seleccionarReporte(reporte) {
    document.querySelector("#detalle-reporte").textContent = categoriaReporte(reporte);
    document.querySelector("#detalle-ubicacion").textContent =
        reporte.location.address || "Ubicación por confirmar";
    document.querySelector("#detalle-fecha").textContent = fechaReporte(reporte);
    const estado = estadoNormalizado(reporte);
    const estadoElement = document.querySelector("#detalle-estado");
    estadoElement.textContent = etiquetaEstado(estado);
    estadoElement.className = `estado ${estado === "reparado" ? "estado-verde" : estado === "en_proceso" ? "estado-amarillo" : "estado-azul"}`;
    const enlace = document.createElement("a");
    enlace.href = `reporte-detalle.html?id=${encodeURIComponent(reporte.id)}`;
    enlace.textContent = "Abrir detalle e historial";
    const detailContainer = document.querySelector(".info-detalle");
    const previousLink = detailContainer.querySelector("[data-detail-link]");
    previousLink?.remove();
    enlace.dataset.detailLink = "true";
    detailContainer.append(enlace);
}

function renderizarMapa(reportes) {
    marcadores.clearLayers();
    let ubicacionesValidas = 0;
    reportes.forEach((reporte) => {
        const coordenadas = coordenadasReporte(reporte);
        if (!coordenadas) return;
        ubicacionesValidas += 1;
        const marcador = L.marker(coordenadas).addTo(marcadores);
        marcador.bindPopup(crearDetalleMarcador(reporte));
        marcador.on("click", () => seleccionarReporte(reporte));
    });
    contadorReportes.textContent = `${reportes.length} reportes · ${ubicacionesValidas} con ubicación`;
}

function renderizarReportes() {
    const filtrados = reportesFiltrados();
    renderizarMapa(filtrados);
    renderizarLista(filtrados);
}

async function cargarReportes() {
    try {
        reportesDisponibles = await window.MiCalleServices.getPublicReports();
        prepararFiltroCategorias();
        renderizarReportes();
    } catch (error) {
        console.error("No se pudieron cargar los reportes públicos:", error);
        contadorReportes.textContent = "No se pudieron cargar los reportes.";
        listaReportes.textContent = "No se pudieron cargar los reportes. Intenta nuevamente.";
    }
}

filtroCategoria.addEventListener("change", renderizarReportes);
filtroEstado.addEventListener("change", renderizarReportes);
mapa.locate({ setView: false, enableHighAccuracy: true, timeout: 10000 });
mapa.on("locationfound", (evento) => {
    L.marker(evento.latlng).addTo(mapa).bindPopup("Tú estás aquí");
});
mapa.on("locationerror", () => console.info("Ubicación del usuario no disponible; puedes explorar el mapa."));
window.MiCalleServices.subscribePublicReports((reports) => {
    reportesDisponibles = reports;
    prepararFiltroCategorias();
    renderizarReportes();
});
cargarReportes();
