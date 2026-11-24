(function () {
    const estados = new Set(["pendiente", "en_revision", "en_proceso", "reparado", "descartado"]);
    const iconoSvg = '<svg viewBox="0 0 36 44" aria-hidden="true"><path d="M18 1.5c-8.3 0-15 6.7-15 15 0 10.5 15 25.5 15 25.5s15-15 15-25.5c0-8.3-6.7-15-15-15Z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="18" cy="16.5" r="5.5" fill="#fff"/></svg>';
    const svgNamespace = "http://www.w3.org/2000/svg";
    const categoryGlyphs = Object.freeze({
        bache: [
            ["path", { d: "M5 4 3 20M19 4l2 16M12 4v6m-3 5 2-2h2l2 2-2 3h-2z" }]
        ],
        "grieta-fisura": [
            ["path", { d: "m14 2-5 7 4 2-4 5 3 1-2 5" }]
        ],
        hundimiento: [
            ["path", { d: "M12 3v11m-4-4 4 4 4-4M4 20h16" }]
        ],
        "alcantarilla-sin-tapa": [
            ["circle", { cx: "12", cy: "12", r: "9" }],
            ["path", { d: "M8 6v12m4-15v18m4-15v12M4 12h16" }]
        ],
        "semaforo-en-mal-estado": [
            ["rect", { x: "7", y: "2", width: "10", height: "17", rx: "3" }],
            ["circle", { cx: "12", cy: "6", r: "1.5" }],
            ["circle", { cx: "12", cy: "10.5", r: "1.5" }],
            ["circle", { cx: "12", cy: "15", r: "1.5" }],
            ["path", { d: "M12 19v3" }]
        ],
        "senalizacion-danada-o-inexistente": [
            ["path", { d: "M6 21V4h13v11H6m4-7h5m-2 0-2 3 3 2-2 2" }]
        ],
        "alumbrado-publico-danado": [
            ["path", { d: "M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4 12.7c.8.6 1.3 1.3 1.5 2.3h5c.2-1 .7-1.7 1.5-2.3A7 7 0 0 0 12 2Z" }]
        ],
        "acumulacion-de-basura": [
            ["path", { d: "M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14m-8 4v7m4-7v7" }]
        ],
        otro: [
            ["circle", { cx: "12", cy: "12", r: "9" }],
            ["path", { d: "M9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1.1 1-1.8 1.3-1.8 2.8m0 3h.01" }]
        ]
    });

    function createCategoryGlyph(categoryKey) {
        const svg = document.createElementNS(svgNamespace, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "15");
        svg.setAttribute("height", "15");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2.2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");

        (categoryGlyphs[categoryKey] || categoryGlyphs.otro).forEach(([tagName, attributes]) => {
            const shape = document.createElementNS(svgNamespace, tagName);
            Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
            svg.append(shape);
        });
        return svg;
    }

    window.MiCalleMapIcons = Object.freeze({
        createStatusIcon(status) {
            const estado = estados.has(status) ? status : "pendiente";
            return L.divIcon({
                className: "leaflet-div-icon reporte-marker-icon",
                html: `<span class="reporte-marker reporte-marker--${estado}" aria-hidden="true">${iconoSvg}</span>`,
                iconSize: [36, 44],
                iconAnchor: [18, 43],
                popupAnchor: [0, -39]
            });
        },
        createCategoryIcon(value) {
            const category = window.MiCalleReportFormatters.getCategory(value);
            const marker = document.createElement("span");
            marker.className = "reporte-marker reporte-marker--categoria";
            marker.style.setProperty("--color-categoria", category.color);
            marker.setAttribute("aria-hidden", "true");

            const pin = document.createElement("span");
            pin.className = "reporte-marker-fondo";

            const head = document.createElement("span");
            head.className = "reporte-marker-cabeza";
            head.append(createCategoryGlyph(category.key));
            marker.append(pin, head);

            return L.divIcon({
                className: "leaflet-div-icon reporte-marker-icon",
                html: marker,
                iconSize: [34, 42],
                iconAnchor: [17, 42],
                popupAnchor: [0, -38]
            });
        },
        createCategoryGlyph
    });
})();
