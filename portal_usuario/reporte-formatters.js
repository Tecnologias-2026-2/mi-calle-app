(function installReportFormatters(root, createFormatters) {
    const formatters = createFormatters();
    if (typeof module === "object" && module.exports) {
        module.exports = formatters;
    }
    if (root) {
        root.MiCalleReportFormatters = formatters;
    }
})(typeof window === "undefined" ? null : window, function createFormatters() {
    const categoryCatalog = Object.freeze([
        Object.freeze({ key: "bache", label: "Bache", icon: "fa-road", color: "#C2415D" }),
        Object.freeze({ key: "grieta-fisura", label: "Grieta / Fisura", icon: "fa-road-barrier", color: "#B54708" }),
        Object.freeze({ key: "hundimiento", label: "Hundimiento", icon: "fa-arrows-down-to-line", color: "#6D28D9" }),
        Object.freeze({ key: "alcantarilla-sin-tapa", label: "Alcantarilla sin tapa", icon: "fa-droplet", color: "#0E7490" }),
        Object.freeze({ key: "semaforo-en-mal-estado", label: "Semáforo en mal estado", icon: "fa-traffic-light", color: "#946C00" }),
        Object.freeze({ key: "senalizacion-danada-o-inexistente", label: "Señalización dañada o inexistente", icon: "fa-signs-post", color: "#1D5FA7" }),
        Object.freeze({ key: "alumbrado-publico-danado", label: "Alumbrado público dañado", icon: "fa-lightbulb", color: "#4D7C0F" }),
        Object.freeze({ key: "acumulacion-de-basura", label: "Acumulación de basura", icon: "fa-trash", color: "#6F4E37" }),
        Object.freeze({ key: "otro", label: "Otro", icon: "fa-circle-question", color: "#475467" })
    ]);

    const aliases = new Map([
        ["bache", "Bache"],
        ["baches", "Bache"],
        ["hueco", "Bache"],
        ["huecos", "Bache"],
        ["hueco en la via", "Bache"],
        ["grieta", "Grieta / Fisura"],
        ["grietas", "Grieta / Fisura"],
        ["grieta / fisura", "Grieta / Fisura"],
        ["grieta fisura", "Grieta / Fisura"],
        ["hundimiento", "Hundimiento"],
        ["alcantarilla", "Alcantarilla sin tapa"],
        ["alcantarilla sin tapa", "Alcantarilla sin tapa"],
        ["semaforo", "Semáforo en mal estado"],
        ["semaforo en mal estado", "Semáforo en mal estado"],
        ["senalizacion", "Señalización dañada o inexistente"],
        ["senalizacion danada", "Señalización dañada o inexistente"],
        ["senalizacion danada o inexistente", "Señalización dañada o inexistente"],
        ["alumbrado", "Alumbrado público dañado"],
        ["alumbrado publico", "Alumbrado público dañado"],
        ["alumbrado publico danado", "Alumbrado público dañado"],
        ["basura", "Acumulación de basura"],
        ["acumulacion de basura", "Acumulación de basura"],
        ["otro", "Otro"],
        ["otros", "Otro"],
        ["otro problema", "Otro"],
        ["otros problemas", "Otro"]
    ]);

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
        const raw = String(value || "").trim();
        return aliases.get(normalizeCategory(raw)) || raw || "Otro";
    }

    function getCategory(value) {
        const label = formatCategory(value);
        return categoryCatalog.find((category) => category.label === label)
            || categoryCatalog[categoryCatalog.length - 1];
    }

    return Object.freeze({
        categories: categoryCatalog,
        formatCategory,
        getCategory
    });
});
