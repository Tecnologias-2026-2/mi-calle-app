const formularioReporte = document.querySelector("#formulario-reporte");
const urlReportes = "http://localhost:3000/reportes";

formularioReporte.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const botonEnvio = formularioReporte.querySelector("[type=submit]");
    const datosFormulario = new FormData(formularioReporte);
    const reporte = {
        usuarioId: 1,
        tipo: datosFormulario.get("tipo"),
        ubicacion: datosFormulario.get("ubicacion").trim(),
        descripcion: datosFormulario.get("descripcion").trim(),
        fecha: new Date().toISOString().slice(0, 10),
        estado: "reportado"
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

        const datosRespuesta = await respuesta.json();
        console.log("Respuesta del servidor al crear el reporte:", datosRespuesta);

        if (!respuesta.ok) {
            throw new Error(datosRespuesta.error || `Error HTTP ${respuesta.status}`);
        }

        window.location.href = "mis_reportes.html";
    } catch (error) {
        console.error("No se pudo crear el reporte:", error);
        alert("No se pudo enviar el reporte. Verifica que el servidor esté disponible e inténtalo de nuevo.");
    } finally {
        botonEnvio.disabled = false;
    }
});