(function installReportFormatters(root) {
    const categories = {
        bache: "Bache",
        baches: "Bache",
        hueco: "Bache",
        huecos: "Bache",
        "hueco en la via": "Bache",
        semaforo: "Semáforo",
        "semaforo en mal estado": "Semáforo en mal estado",
        alcantarilla: "Alcantarilla",
        "alcantarilla sin tapa": "Alcantarilla sin tapa",
        senalizacion: "Señalización",
        "senalizacion danada": "Señalización dañada",
        alumbrado: "Alumbrado público",
        "alumbrado publico danado": "Alumbrado público dañado",
        basura: "Acumulación de basura",
        "acumulacion de basura": "Acumulación de basura",
        otro: "Otro problema",
        otros: "Otros"
    };

    function normalizeCategory(value) {
        return String(value || "")
            .trim()
            .toLocaleLowerCase("es")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ");
    }

    function formatCategory(value) {
        const raw = String(value || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
        const normalized = normalizeCategory(raw);
        if (categories[normalized]) return categories[normalized];
        if (!raw) return "Otro problema";
        return raw.charAt(0).toLocaleUpperCase("es") + raw.slice(1).toLocaleLowerCase("es");
    }

    root.MiCalleReportFormatters = Object.freeze({ formatCategory });
})(window);
