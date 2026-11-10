const formularioReporte = document.querySelector("#formulario-reporte");
const BASE_URL = "https://mi-calle-app-backend.onrender.com";
const urlReportes = `${BASE_URL}/reportes`;

formularioReporte.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const botonEnvio = formularioReporte.querySelector("[type=submit]");
    const datosFormulario = new FormData(formularioReporte);
    const reporte = {
        tipo_problema: datosFormulario.get("tipo"),
        direccion_texto: datosFormulario.get("ubicacion").trim(),
        latitud: Number(datosFormulario.get("latitud")),
        longitud: Number(datosFormulario.get("longitud")),
        descripcion: datosFormulario.get("descripcion").trim(),
        estado_atencion: "Reportado"
    };

    botonEnvio.disabled = true;

    try {
        const respuesta = await fetch(urlReportes, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(reporte)
        });

        const datosRespuesta = await respuesta.json().catch(() => ({}));
        console.log("Respuesta del servidor al crear el reporte:", datosRespuesta);

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