const formularioReporte = document.querySelector("#formulario-reporte");
const inputFotografia = document.querySelector("#input-foto");
const estadoFotografia = document.querySelector("#estado-fotografia");
const vistaPreviaFotografia = document.querySelector("#vista-previa-fotografia");
const estadoUbicacion = document.querySelector("#estado-ubicacion");
const inputLatitud = document.querySelector("#input-lat");
const inputLongitud = document.querySelector("#input-lng");
const inputDireccion = document.querySelector("#direccion-texto");
const mapaFormulario = L.map("mapa").setView([4.711, -74.0721], 13);
let marcadorSeleccionado = null;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapaFormulario);

function actualizarUbicacion(latlng) {
    inputLatitud.value = latlng.lat.toFixed(6);
    inputLongitud.value = latlng.lng.toFixed(6);
    estadoUbicacion.textContent = `Ubicación seleccionada: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    estadoUbicacion.dataset.error = "false";
}

function colocarMarcador(latlng) {
    if (!marcadorSeleccionado) {
        marcadorSeleccionado = L.marker(latlng, { draggable: true }).addTo(mapaFormulario);
        marcadorSeleccionado.bindPopup("Ubicación del reporte").openPopup();
        marcadorSeleccionado.on("dragend", (evento) => {
            actualizarUbicacion(evento.target.getLatLng());
        });
    } else {
        marcadorSeleccionado.setLatLng(latlng);
    }
    actualizarUbicacion(latlng);
}

mapaFormulario.on("click", (evento) => colocarMarcador(evento.latlng));
mapaFormulario.locate({
    setView: false,
    enableHighAccuracy: true,
    timeout: 10000
});
mapaFormulario.on("locationfound", (evento) => {
    mapaFormulario.setView(evento.latlng, 16);
});
mapaFormulario.on("locationerror", () => {
    estadoUbicacion.textContent = "Haz clic en el mapa para seleccionar la ubicación.";
});

inputFotografia.addEventListener("change", () => {
    const [archivo] = inputFotografia.files;
    if (!archivo) {
        estadoFotografia.textContent = "No has seleccionado una fotografía.";
        vistaPreviaFotografia.hidden = true;
        return;
    }

    if (!["image/jpeg", "image/png"].includes(archivo.type) || archivo.size > 5 * 1024 * 1024) {
        inputFotografia.value = "";
        estadoFotografia.textContent = "La fotografía debe ser JPG o PNG y pesar máximo 5 MB.";
        estadoFotografia.dataset.error = "true";
        vistaPreviaFotografia.hidden = true;
        return;
    }

    estadoFotografia.textContent = `Fotografía seleccionada: ${archivo.name}`;
    estadoFotografia.dataset.error = "false";
    vistaPreviaFotografia.src = URL.createObjectURL(archivo);
    vistaPreviaFotografia.hidden = false;
});

formularioReporte.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const botonEnvio = formularioReporte.querySelector("[type=submit]");
    const datosFormulario = new FormData(formularioReporte);
    const reporte = {
        tipo_problema: datosFormulario.get("tipo"),
        latitud: Number(datosFormulario.get("latitud")),
        longitud: Number(datosFormulario.get("longitud")),
        direccion_texto: String(datosFormulario.get("direccion_texto") || "").trim(),
        descripcion: String(datosFormulario.get("descripcion") || "").trim(),
        estado_atencion: "Reportado"
    };

    if (!Number.isFinite(reporte.latitud) || !Number.isFinite(reporte.longitud)) {
        estadoUbicacion.textContent = "Selecciona la ubicación del reporte en el mapa antes de enviar.";
        estadoUbicacion.dataset.error = "true";
        return;
    }

    if (!reporte.direccion_texto) {
        inputDireccion.setCustomValidity("Ingresa una dirección aproximada.");
        inputDireccion.reportValidity();
        return;
    }
    inputDireccion.setCustomValidity("");
    botonEnvio.disabled = true;

    try {
        const respuesta = await MiCalleAuth.request("/reportes", {
            method: "POST",
            body: JSON.stringify(reporte)
        });
        const datosRespuesta = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            throw new Error(datosRespuesta.error || `Error HTTP ${respuesta.status}`);
        }

        window.location.href = "mis_reportes.html";
    } catch (error) {
        console.error("No se pudo crear el reporte:", error);
        alert(error.message || "No se pudo enviar el reporte. Inténtalo de nuevo.");
    } finally {
        botonEnvio.disabled = false;
    }
});
