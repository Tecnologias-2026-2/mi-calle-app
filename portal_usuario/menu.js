const btnMenu = document.querySelector("#btn-menu");
const menu = document.querySelector("#menu-navegacion");

btnMenu.addEventListener("click", () => {
    const abierto = menu.classList.toggle("abierto");

    // Cambia el icono de barras a X y viceversa
    btnMenu.querySelector("i").className = abierto
        ? "fa-solid fa-xmark"
        : "fa-solid fa-bars";

    btnMenu.setAttribute("aria-expanded", abierto);
});


/* ==========================================================================
   datos.js · Capa de datos del portal Mi Calle
   --------------------------------------------------------------------------
   - Lee los datos iniciales desde ../data/*.json (fetch)
   - Guarda los cambios en localStorage (el navegador no puede escribir JSON)
   - Más adelante, solo esta capa se cambia por llamadas a un servidor
   ========================================================================== */
 
const Datos = {
 
    rutaBase: "../data/",
    prefijo: "micalle_",
 
    /* Devuelve los datos: primero lo guardado por el usuario, si no, el JSON */
    async cargar(nombre) {
        const guardado = localStorage.getItem(this.prefijo + nombre);
        if (guardado) {
            return JSON.parse(guardado);
        }
 
        const respuesta = await fetch(`${this.rutaBase}${nombre}.json`);
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar ${nombre}.json (${respuesta.status})`);
        }
        return respuesta.json();
    },
 
    /* Guarda cambios (nuevo reporte, perfil editado, preferencias...) */
    guardar(nombre, datos) {
        localStorage.setItem(this.prefijo + nombre, JSON.stringify(datos));
    },
 
    /* Borra lo guardado y vuelve a los JSON originales (útil al probar) */
    reiniciar() {
        ["usuario", "reportes", "configuracion"].forEach((nombre) => {
            localStorage.removeItem(this.prefijo + nombre);
        });
    }
};
 
 
/* ==========================================================================
   Catálogos (textos, iconos y clases CSS de cada tipo y estado)
   Las claves coinciden con los value del <select> de reportar.html
   ========================================================================== */
const TIPOS = {
    huecos:       { nombre: "Hueco en la vía",          icono: "fa-road" },
    semaforo:     { nombre: "Semáforo en mal estado",   icono: "fa-traffic-light" },
    alcantarilla: { nombre: "Alcantarilla sin tapa",    icono: "fa-droplet" },
    senalizacion: { nombre: "Señalización dañada",      icono: "fa-signs-post" },
    alumbrado:    { nombre: "Alumbrado público dañado", icono: "fa-lightbulb" },
    basura:       { nombre: "Acumulación de basura",    icono: "fa-trash" },
    otros:        { nombre: "Otros",                    icono: "fa-circle-exclamation" }
};
 
const ESTADOS = {
    reportado:   { texto: "Reportado",   clase: "estado-azul" },
    en_revision: { texto: "En revisión", clase: "estado-rojo" },
    reparado:    { texto: "Reparado",    clase: "estado-verde" }
};
 
 
/* ==========================================================================
   Utilidades
   ========================================================================== */
 
/* Cuenta los reportes por estado (para las tarjetas de resumen) */
function contarReportes(reportes) {
    return {
        total: reportes.length,
        reportado: reportes.filter((r) => r.estado === "reportado").length,
        en_revision: reportes.filter((r) => r.estado === "en_revision").length,
        reparado: reportes.filter((r) => r.estado === "reparado").length
    };
}
 
/* "2026-10-24" -> "24 de octubre de 2026" */
function formatearFecha(fechaISO) {
    return new Date(fechaISO + "T00:00:00").toLocaleDateString("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
 
/* "2026-10-24" -> "Hace 2 días" */
function tiempoRelativo(fechaISO) {
    const dias = Math.floor((Date.now() - new Date(fechaISO + "T00:00:00")) / 86400000);
 
    if (dias <= 0) return "Hoy";
    if (dias === 1) return "Hace 1 día";
    if (dias < 7) return `Hace ${dias} días`;
    if (dias < 30) {
        const semanas = Math.floor(dias / 7);
        return `Hace ${semanas} ${semanas === 1 ? "semana" : "semanas"}`;
    }
    if (dias < 365) {
        const meses = Math.floor(dias / 30);
        return `Hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
    }
    const anios = Math.floor(dias / 365);
    return `Hace ${anios} ${anios === 1 ? "año" : "años"}`;
}
 

