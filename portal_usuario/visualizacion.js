const BASE_URL = "https://mi-calle-app-backend.onrender.com";
const BOGOTA = [4.711, -74.0721];
const mapa = L.map("mapa").setView(BOGOTA, 13);
const contadorReportes = document.querySelector(".contador-reportes");

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapa);

function mostrarUbicacionUsuario(evento) {
    L.marker(evento.latlng)
        .addTo(mapa)
        .bindPopup("Tú estás aquí")
        .openPopup();
    mapa.setView(evento.latlng, 15);
}

function manejarErrorUbicacion() {
    console.warn("No se pudo obtener la ubicación del usuario.");
}

function agregarMarcadores(reportes) {
    const reportesValidos = reportes.filter((reporte) => {
        const latitud = Number(reporte.latitud);
        const longitud = Number(reporte.longitud);
        return Number.isFinite(latitud) && Number.isFinite(longitud);
    });

    reportesValidos.forEach((reporte) => {
        const marcador = L.marker([
            Number(reporte.latitud),
            Number(reporte.longitud)
        ]).addTo(mapa);

        marcador.bindPopup(`
            <strong>${reporte.tipo_problema || reporte.tipo || "Reporte vial"}</strong>
            <br>${reporte.descripcion || "Sin descripción"}
        `);
    });

    if (contadorReportes) {
        contadorReportes.textContent = `${reportesValidos.length} reportes en tu zona`;
    }
}

async function cargarReportes() {
    try {
        const respuesta = await fetch(`${BASE_URL}/reportes`);
        const datos = await respuesta.json().catch(() => []);
        if (!respuesta.ok) {
            throw new Error(datos.error || `Error HTTP ${respuesta.status}`);
        }
        agregarMarcadores(datos);
    } catch (error) {
        console.error("No se pudieron cargar los reportes:", error);
        if (contadorReportes) {
            contadorReportes.textContent = "No se pudieron cargar los reportes";
        }
    }
}

mapa.locate({
    setView: false,
    enableHighAccuracy: true,
    timeout: 10000
});
mapa.on("locationfound", mostrarUbicacionUsuario);
mapa.on("locationerror", manejarErrorUbicacion);
cargarReportes();
