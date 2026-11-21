(function () {
    const estados = new Set(["pendiente", "en_revision", "en_proceso", "reparado", "descartado"]);
    const iconoSvg = '<svg viewBox="0 0 36 44" aria-hidden="true"><path d="M18 1.5c-8.3 0-15 6.7-15 15 0 10.5 15 25.5 15 25.5s15-15 15-25.5c0-8.3-6.7-15-15-15Z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="18" cy="16.5" r="5.5" fill="#fff"/></svg>';

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
        }
    });
})();
