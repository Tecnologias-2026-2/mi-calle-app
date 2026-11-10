const mapaFormulario = L.map("mapa").setView([4.711, -74.0721], 13);
const inputLatitud = document.querySelector("#input-lat");
const inputLongitud = document.querySelector("#input-lng");
let marcadorSeleccionado = null;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapaFormulario);

function actualizarCoordenadas(latlng) {
    inputLatitud.value = latlng.lat.toFixed(6);
    inputLongitud.value = latlng.lng.toFixed(6);
}

function colocarMarcador(latlng) {
    if (!marcadorSeleccionado) {
        marcadorSeleccionado = L.marker(latlng, {
            draggable: true
        }).addTo(mapaFormulario);

        marcadorSeleccionado.bindPopup("Ubicación del reporte").openPopup();
        marcadorSeleccionado.on("dragend", (evento) => {
            actualizarCoordenadas(evento.target.getLatLng());
        });
    } else {
        marcadorSeleccionado.setLatLng(latlng);
    }

    actualizarCoordenadas(latlng);
}

// Un clic en el mapa mueve el marcador y actualiza ambos inputs ocultos.
mapaFormulario.on("click", (evento) => {
    colocarMarcador(evento.latlng);
});

// Al arrastrar el marcador, dragend actualiza las coordenadas del formulario.
mapaFormulario.on("locationfound", (evento) => {
    mapaFormulario.setView(evento.latlng, 16);
    colocarMarcador(evento.latlng);
});

mapaFormulario.on("locationerror", () => {
    console.warn("No se pudo obtener la ubicación actual; selecciona un punto manualmente.");
});

mapaFormulario.locate({
    setView: false,
    enableHighAccuracy: true,
    timeout: 10000
});
