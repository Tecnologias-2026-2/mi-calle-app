const BOGOTA = [4.711, -74.0721];
const mapa = L.map("mapa").setView(BOGOTA, 13);
const contadorReportes = document.querySelector(".contador-reportes");
const listaReportes = document.querySelector("#lista-reportes-publicos");
const filtroCategoria = document.querySelector("#filtro-categoria");
const filtroEstado = document.querySelector("#filtro-estado");
const leyendaCategorias = document.querySelector("#leyenda-categorias");
const marcadores = L.layerGroup().addTo(mapa);
const estadosReporte = {
    pendiente: "Pendiente",
    en_revision: "En revisión",
    en_proceso: "En proceso",
    reparado: "Reparado",
    descartado: "Descartado"
};
const iconosEstado = {
    pendiente: "fa-clock",
    en_revision: "fa-magnifying-glass",
    en_proceso: "fa-screwdriver-wrench",
    reparado: "fa-circle-check",
    descartado: "fa-ban"
};
const formatoCategoria = window.MiCalleReportFormatters.formatCategory;
const categoriasReporte = window.MiCalleReportFormatters.categories;
const crearIconoMarcador = window.MiCalleMapIcons.createCategoryIcon;
let reportesDisponibles = [];

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

function estadoNormalizado(reporte) {
    return estadosReporte[reporte.status] ? reporte.status : "pendiente";
}

function etiquetaEstado(estado) {
    return estadosReporte[estado] || estadosReporte.pendiente;
}

function categoriaReporte(reporte) {
    return formatoCategoria(reporte.type);
}

function coordenadasReporte(reporte) {
    if (reporte.location.latitude == null || reporte.location.longitude == null) return null;
    const latitud = Number(reporte.location.latitude);
    const longitud = Number(reporte.location.longitude);
    return Number.isFinite(latitud) && Number.isFinite(longitud)
        ? [latitud, longitud]
        : null;
}

function prepararFiltroCategorias() {
    const seleccionActual = filtroCategoria.value;
    const categorias = [...new Set([
        ...categoriasReporte.map((categoria) => categoria.label),
        ...reportesDisponibles.map(categoriaReporte)
    ])]
        .sort((a, b) => a.localeCompare(b, "es"));
    filtroCategoria.replaceChildren(new Option("Todas", ""));
    categorias.forEach((categoria) => filtroCategoria.add(new Option(categoria, categoria)));
    filtroCategoria.value = categorias.includes(seleccionActual) ? seleccionActual : "";

    leyendaCategorias.replaceChildren(...categoriasReporte.map((category) => {
        const item = document.createElement("div");
        item.className = "item-leyenda";
        const icon = document.createElement("span");
        icon.className = "categoria-leyenda-icono";
        icon.style.color = category.color;
        icon.setAttribute("aria-hidden", "true");
        const glyph = document.createElement("i");
        glyph.className = `fa-solid ${category.icon}`;
        icon.append(glyph);
        const label = document.createElement("span");
        label.textContent = category.label;
        item.append(icon, label);
        return item;
    }));
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
    detalle.className = "reporte-popup-contenido";

    const titulo = document.createElement("strong");
    titulo.className = "reporte-popup-categoria";
    titulo.textContent = categoriaReporte(reporte);

    const estado = document.createElement("span");
    const status = estadoNormalizado(reporte);
    estado.className = `reporte-popup-estado reporte-popup-estado--${status}`;
    estado.textContent = etiquetaEstado(status);

    const descripcion = document.createElement("p");
    const textoDescripcion = [reporte.description, reporte.descripcion]
        .find((value) => typeof value === "string" && value.trim());
    descripcion.textContent = textoDescripcion
        ? textoDescripcion.trim()
        : "Este reporte aún no tiene descripción.";

    const enlace = document.createElement("a");
    enlace.className = "reporte-popup-enlace";
    enlace.href = `reporte-detalle.html?id=${encodeURIComponent(reporte.id)}`;
    enlace.textContent = "Ver detalle e historial";
    detalle.append(titulo, estado, descripcion, enlace);
    return detalle;
}

function renderizarLista(reportes) {
    if (!reportes.length) {
        listaReportes.textContent = "No hay reportes que coincidan con los filtros.";
        return;
    }

    const fragment = document.createDocumentFragment();
    reportes.forEach((reporte) => {
        const estado = estadoNormalizado(reporte);
        const tarjeta = document.createElement("article");
        tarjeta.className = "reporte-publico-item";

        const icono = document.createElement("span");
        icono.className = `reporte-publico-icono reporte-publico-icono--${estado}`;
        icono.dataset.statusIcon = estado;
        icono.setAttribute("aria-hidden", "true");
        const ilustracion = document.createElement("i");
        ilustracion.className = `fa-solid ${iconosEstado[estado]}`;
        icono.append(ilustracion);

        const informacion = document.createElement("div");
        informacion.className = "reporte-publico-informacion";
        const titulo = document.createElement("h3");
        titulo.textContent = categoriaReporte(reporte);
        const direccion = document.createElement("p");
        direccion.textContent = reporte.location.address || "Ubicación por confirmar";
        informacion.append(titulo, direccion);

        const etiqueta = document.createElement("span");
        etiqueta.className = `reporte-publico-badge reporte-publico-badge--${estado}`;
        etiqueta.textContent = etiquetaEstado(estado);

        const enlace = document.createElement("a");
        enlace.className = "reporte-publico-enlace";
        enlace.href = `reporte-detalle.html?id=${encodeURIComponent(reporte.id)}`;
        enlace.textContent = "Ver detalle";

        tarjeta.append(icono, informacion, etiqueta, enlace);
        fragment.append(tarjeta);
    });
    listaReportes.replaceChildren(fragment);
}

function renderizarMapa(reportes) {
    marcadores.clearLayers();
    let ubicacionesValidas = 0;
    reportes.forEach((reporte) => {
        const coordenadas = coordenadasReporte(reporte);
        if (!coordenadas) return;
        ubicacionesValidas += 1;
        const estado = estadoNormalizado(reporte);
        const marcador = L.marker(coordenadas, {
            icon: crearIconoMarcador(reporte.type),
            title: `${categoriaReporte(reporte)} · ${etiquetaEstado(estado)}`
        }).addTo(marcadores);
        marcador.bindPopup(crearDetalleMarcador(reporte), {
            className: "reporte-popup",
            maxWidth: 300
        });
    });
    mapa.getContainer().setAttribute("aria-busy", "false");
    contadorReportes.textContent = `${reportes.length} reportes · ${ubicacionesValidas} con ubicación`;
}

function renderizarReportes() {
    const filtrados = reportesFiltrados();
    renderizarMapa(filtrados);
    renderizarLista(filtrados);
    listaReportes.setAttribute("aria-busy", "false");
}

filtroCategoria.addEventListener("change", renderizarReportes);
filtroEstado.addEventListener("change", renderizarReportes);
mapa.getContainer().setAttribute("aria-busy", "true");
listaReportes.setAttribute("aria-busy", "true");
mapa.locate({ setView: false, enableHighAccuracy: true, timeout: 10000 });
mapa.on("locationfound", (evento) => {
    L.circleMarker(evento.latlng, {
        radius: 8,
        color: "#1565C0",
        fillColor: "#2A9DF4",
        fillOpacity: 1,
        weight: 3
    }).addTo(mapa).bindPopup("Tú estás aquí");
});
mapa.on("locationerror", () => console.info("Ubicación del usuario no disponible; puedes explorar el mapa."));
window.MiCalleServices.subscribePublicReports((reports) => {
    reportesDisponibles = reports;
    prepararFiltroCategorias();
    renderizarReportes();
}, (error) => {
    console.error("No se pudieron cargar los reportes públicos:", error);
    mapa.getContainer().setAttribute("aria-busy", "false");
    listaReportes.setAttribute("aria-busy", "false");
    contadorReportes.textContent = "No se pudieron cargar los reportes.";
    listaReportes.textContent = "No se pudieron cargar los reportes. Intenta nuevamente.";
});
