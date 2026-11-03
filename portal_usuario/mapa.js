const urlReportes = "http://localhost:3000/reportes";
const areaMapa = document.querySelector("#area-mapa");
const contadorReportes = document.querySelector(".contador-reportes");
const tiposReporte = {
    huecos: { nombre: "Hueco en la vía", icono: "fa-road" },
    semaforo: { nombre: "Semáforo en mal estado", icono: "fa-traffic-light" },
    alcantarilla: { nombre: "Alcantarilla sin tapa", icono: "fa-droplet" },
    senalizacion: { nombre: "Señalización dañada", icono: "fa-signs-post" },
    alumbrado: { nombre: "Alumbrado público dañado", icono: "fa-lightbulb" },
    basura: { nombre: "Acumulación de basura", icono: "fa-trash" },
    otros: { nombre: "Otros", icono: "fa-circle-exclamation" }
};

const estadosReporte = {
    reportado: { texto: "Reportado", pinClase: "pin-azul", estadoClase: "estado-azul" },
    en_revision: { texto: "En revisión", pinClase: "pin-naranja", estadoClase: "estado-rojo" },
    reparado: { texto: "Reparado", pinClase: "pin-verde", estadoClase: "estado-verde" }
};

function formatearFecha(fecha) {
    if (!fecha) return "Sin fecha";

    const fechaValida = new Date(`${fecha}T00:00:00`);
    if (Number.isNaN(fechaValida.getTime())) return fecha;

    return fechaValida.toLocaleDateString("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function obtenerPosicion(indice) {
    return {
        top: `${20 + ((indice * 19) % 65)}%`,
        left: `${15 + ((indice * 31) % 70)}%`
    };
}

function crearPin(reporte, indice) {
    const tipo = tiposReporte[reporte.tipo] || {
        nombre: reporte.categoria || "Reporte",
        icono: "fa-circle-exclamation"
    };
    const estado = estadosReporte[reporte.estado] || estadosReporte.reportado;
    const posicion = obtenerPosicion(indice);
    const pin = document.createElement("div");

    pin.className = `pin ${estado.pinClase}`;
    pin.dataset.reporte = tipo.nombre;
    pin.dataset.ubicacion = reporte.ubicacion || "Sin ubicación";
    pin.dataset.fecha = formatearFecha(reporte.fecha);
    pin.dataset.estado = estado.texto;
    pin.dataset.estadoClase = estado.estadoClase;
    pin.dataset.icono = tipo.icono;
    pin.setAttribute("role", "button");
    pin.setAttribute("tabindex", "0");
    pin.setAttribute("aria-label", `Ver reporte: ${tipo.nombre}`);
    pin.style.top = posicion.top;
    pin.style.left = posicion.left;
    pin.innerHTML = '<i class="fa-solid fa-location-dot"></i>';

    return pin;
}

function mostrarDetalle(pin) {
    document.querySelector("#detalle-reporte").textContent = pin.dataset.reporte;
    document.querySelector("#detalle-ubicacion").textContent = pin.dataset.ubicacion;
    document.querySelector("#detalle-fecha").textContent = pin.dataset.fecha;

    const detalleEstado = document.querySelector("#detalle-estado");
    detalleEstado.textContent = pin.dataset.estado;
    detalleEstado.className = `estado ${pin.dataset.estadoClase}`;
    document.querySelector("#detalle-icono").className = `fa-solid ${pin.dataset.icono}`;

    areaMapa.querySelectorAll(".pin").forEach((elemento) => {
        elemento.classList.remove("pin-seleccionado");
    });
    pin.classList.add("pin-seleccionado");
}

function conectarEventosPines() {
    areaMapa.querySelectorAll(".pin").forEach((pin) => {
        pin.addEventListener("click", () => mostrarDetalle(pin));
        pin.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                mostrarDetalle(pin);
            }
        });
    });
}

function renderizarReportes(reportes) {
    areaMapa.replaceChildren(...reportes.map(crearPin));
    areaMapa.setAttribute("aria-busy", "false");
    contadorReportes.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${reportes.length} reportes en tu zona`;
    conectarEventosPines();
}

async function cargarReportes() {
    try {
        const respuesta = await fetch(urlReportes);
        if (!respuesta.ok) {
            throw new Error(`Error HTTP ${respuesta.status}`);
        }

        const reportes = await respuesta.json();
        if (!Array.isArray(reportes)) {
            throw new Error("La respuesta del servidor no contiene una lista de reportes");
        }

        console.log("Reportes recibidos para el mapa:", reportes);
        renderizarReportes(reportes);
    } catch (error) {
        console.error("No se pudieron cargar los reportes del mapa:", error);
        areaMapa.setAttribute("aria-busy", "false");
        contadorReportes.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar los reportes';
    }
}

cargarReportes();