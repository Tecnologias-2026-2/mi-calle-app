const formularioReporte = document.querySelector("#formulario-reporte");
const inputFotografia = document.querySelector("#input-foto");
const estadoFotografia = document.querySelector("#estado-fotografia");
const vistaPreviaFotografia = document.querySelector("#vista-previa-fotografia");
const contenedorVistaPreviaFotografia = document.querySelector("#contenedor-vista-previa-fotografia");
const zonaSubirFotografia = document.querySelector(".zona-subir-archivo");
const botonQuitarFotografia = document.querySelector("#quitar-fotografia");
const estadoUbicacion = document.querySelector("#estado-ubicacion");
const inputLatitud = document.querySelector("#input-lat");
const inputLongitud = document.querySelector("#input-lng");
const inputDireccion = document.querySelector("#direccion-texto");
const mapaFormulario = L.map("mapa").setView([4.711, -74.0721], 13);
let marcadorSeleccionado = null;
let fotografiaSeleccionada = null;
let urlVistaPreviaFotografia = null;

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapaFormulario);

function actualizarUbicacion(latlng) {
    inputLatitud.value = latlng.lat.toFixed(6);
    inputLongitud.value = latlng.lng.toFixed(6);
    estadoUbicacion.textContent = `Ubicación seleccionada: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    estadoUbicacion.dataset.error = "false";
}

function colocarMarcador(latlng) {
    if (!marcadorSeleccionado) {
        marcadorSeleccionado = L.marker(latlng, {
            draggable: true,
            icon: window.MiCalleMapIcons.createStatusIcon("pendiente")
        }).addTo(mapaFormulario);
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

function limpiarVistaPreviaFotografia() {
    if (urlVistaPreviaFotografia) {
        URL.revokeObjectURL(urlVistaPreviaFotografia);
        urlVistaPreviaFotografia = null;
    }
    vistaPreviaFotografia.removeAttribute("src");
    contenedorVistaPreviaFotografia.hidden = true;
    zonaSubirFotografia.hidden = false;
}

function mostrarVistaPreviaFotografia(archivo) {
    if (urlVistaPreviaFotografia) URL.revokeObjectURL(urlVistaPreviaFotografia);
    urlVistaPreviaFotografia = URL.createObjectURL(archivo);
    vistaPreviaFotografia.src = urlVistaPreviaFotografia;
    contenedorVistaPreviaFotografia.hidden = false;
    zonaSubirFotografia.hidden = true;
}

document.querySelector(".acciones-fotografia label").addEventListener("click", () => {
    // Permite seleccionar de nuevo el mismo archivo y recibir el evento change.
    inputFotografia.value = "";
});

botonQuitarFotografia.addEventListener("click", () => {
    fotografiaSeleccionada = null;
    inputFotografia.value = "";
    limpiarVistaPreviaFotografia();
    estadoFotografia.textContent = "No has seleccionado una fotografía.";
    estadoFotografia.dataset.error = "false";
});

inputFotografia.addEventListener("change", () => {
    const [archivo] = inputFotografia.files;
    if (!archivo) {
        if (!fotografiaSeleccionada) {
            estadoFotografia.textContent = "No has seleccionado una fotografía.";
            limpiarVistaPreviaFotografia();
        }
        return;
    }

    if (!["image/jpeg", "image/png"].includes(archivo.type) || archivo.size > 5 * 1024 * 1024) {
        inputFotografia.value = "";
        fotografiaSeleccionada = null;
        limpiarVistaPreviaFotografia();
        estadoFotografia.textContent = "La fotografía debe ser JPG o PNG y pesar máximo 5 MB.";
        estadoFotografia.dataset.error = "true";
        return;
    }

    fotografiaSeleccionada = archivo;
    estadoFotografia.textContent = `Fotografía seleccionada: ${archivo.name}`;
    estadoFotografia.dataset.error = "false";
    mostrarVistaPreviaFotografia(archivo);
});

formularioReporte.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const botonEnvio = formularioReporte.querySelector("[type=submit]");
    if (botonEnvio.disabled) return;
    const datosFormulario = new FormData(formularioReporte);
    const latitudIngresada = String(datosFormulario.get("latitud") || "").trim();
    const longitudIngresada = String(datosFormulario.get("longitud") || "").trim();
    const reporte = {
        tipo_problema: String(datosFormulario.get("tipo") || ""),
        latitud: Number(latitudIngresada),
        longitud: Number(longitudIngresada),
        direccion_texto: String(datosFormulario.get("direccion_texto") || "").trim(),
        descripcion: String(datosFormulario.get("descripcion") || "").trim(),
        estado_atencion: "Reportado"
    };
    const fotografia = fotografiaSeleccionada;

    if (!latitudIngresada || !longitudIngresada
        || !Number.isFinite(reporte.latitud) || !Number.isFinite(reporte.longitud)) {
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
    if (!(fotografia instanceof File) || !fotografia.size) {
        estadoFotografia.textContent = "Selecciona una fotografía antes de enviar.";
        estadoFotografia.dataset.error = "true";
        return;
    }
    const contenidoOriginalBoton = botonEnvio.innerHTML;
    botonEnvio.disabled = true;
    botonEnvio.setAttribute("aria-busy", "true");
    botonEnvio.innerHTML = '<span class="loading-spinner loading-spinner--light" aria-hidden="true"></span> Enviando reporte...';

    try {
        await MiCalleServices.createReport({
            type: reporte.tipo_problema,
            description: reporte.descripcion,
            location: {
                latitude: reporte.latitud,
                longitude: reporte.longitud,
                address: reporte.direccion_texto
            },
            photoFile: fotografia
        });

        window.location.href = "mis_reportes.html";
    } catch (error) {
        console.error("No se pudo crear el reporte:", error);
        alert(error.message || "No se pudo enviar el reporte. Inténtalo de nuevo.");
    } finally {
        botonEnvio.innerHTML = contenidoOriginalBoton;
        botonEnvio.disabled = false;
        botonEnvio.setAttribute("aria-busy", "false");
    }
});
