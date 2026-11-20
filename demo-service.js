(function attachDemoService(root, createService) {
  if (typeof module === "object" && module.exports) {
    module.exports = createService;
  }
  if (!root || !root.document) return;

  const scriptUrl = root.document.currentScript?.src || root.location.href;
  const seedUrl = new URL("Portal_admin/HTML/admin-mock-data.json", scriptUrl).href;
  const service = createService({
    localStorage: root.localStorage,
    sessionStorage: root.sessionStorage,
    location: root.location,
    loadSeed: async () => {
      const response = await root.fetch(seedUrl);
      if (!response.ok) {
        throw new Error(`No se pudieron cargar los datos demo (HTTP ${response.status}).`);
      }
      return response.json();
    },
    makePhotoPreview: (file) => makePhotoPreview(root, file),
    dispatch: (detail) => root.dispatchEvent(new root.CustomEvent("mi-calle-demo-change", { detail })),
    addEventListener: (...args) => root.addEventListener(...args),
    document: root.document,
  });

  root.MiCalleDemo = service;
  service.ready = service.initialize();
  service.ready.then(() => installDemoBanner(root, service)).catch((error) => {
    console.error("No se pudo inicializar el modo demostración.", error);
    installDemoBanner(root, service);
  });
  root.addEventListener("storage", (event) => {
    if (event.key === service.storageKey) {
      service.acceptExternalState(event.newValue);
    }
  });
})(typeof window === "undefined" ? null : window, function createDemoService(options = {}) {
  const STORAGE_KEY = "mi-calle-demo-data-v1";
  const SESSION_KEY = "mi-calle-demo-session-v1";
  const PHOTO_PREFIX = "mi-calle-demo-photo-v1:";
  const ALLOWED_STATUSES = new Set(["pendiente", "en_revision", "en_proceso", "reparado"]);
  const localStorage = options.localStorage;
  const sessionStorage = options.sessionStorage;
  const subscribers = new Set();
  let state = null;
  let initialization;
  let reportSequence = 0;

  const search = new URLSearchParams(options.location?.search || "");
  if (search.get("demo") === "1") localStorage.setItem("mi-calle-demo-enabled", "1");
  if (search.get("demo") === "0") {
    localStorage.removeItem("mi-calle-demo-enabled");
    sessionStorage.removeItem(SESSION_KEY);
  }

  function isEnabled() {
    return localStorage.getItem("mi-calle-demo-enabled") === "1";
  }

  function normalizeStatus(value) {
    const status = String(value || "").trim().toLowerCase();
    return ({
      reportado: "pendiente",
      proceso: "en_proceso",
      "en proceso": "en_proceso",
      "en revisión": "en_revision",
      resuelto: "reparado",
      "en_revision": "en_revision",
      "en_proceso": "en_proceso",
    })[status] || (ALLOWED_STATUSES.has(status) ? status : "pendiente");
  }

  function normalizeReport(source, index) {
    const id = String(source.id_reporte || source.id || `MC-${index + 1}`);
    const status = normalizeStatus(source.estado_atencion || source.estado);
    const category = source.tipo_problema || source.categoria || source.tipo || "Otro";
    const address = source.direccion_texto || source.ubicacion || "Ubicación por confirmar";
    const createdAt = source.fecha_creacion || source.fecha || new Date().toISOString();
    const history = Array.isArray(source.historial_estados) && source.historial_estados.length
      ? source.historial_estados.map((entry) => ({
        estado: normalizeStatus(entry.estado),
        fecha_cambio: entry.fecha_cambio || createdAt,
        observacion: entry.observacion || "",
        actor: entry.actor || "Sistema demo",
      }))
      : [{
        estado: status,
        fecha_cambio: createdAt,
        observacion: "Reporte creado en la demostración.",
        actor: "Sistema demo",
      }];

    return {
      ...source,
      id,
      id_reporte: id,
      tipo_problema: category,
      categoria: category,
      estado: status,
      estado_atencion: status,
      direccion_texto: address,
      ubicacion: address,
      descripcion: source.descripcion || "",
      fecha: source.fecha || createdAt,
      fecha_creacion: createdAt,
      updated_at: source.updated_at || createdAt,
      id_usuario: source.id_usuario || source.ownerId || "demo-ciudadano",
      ownerId: source.ownerId || source.id_usuario || "demo-ciudadano",
      reportadoPor: source.reportadoPor || "Ciudadano demo",
      historial_estados: history,
    };
  }

  function normalizeState(value) {
    if (!value || !Array.isArray(value.reportes)) {
      throw new Error("Los datos guardados de la demostración no tienen un formato válido.");
    }
    return {
      estadisticas: Array.isArray(value.estadisticas) ? value.estadisticas : [],
      reportes: value.reportes.map(normalizeReport),
    };
  }

  function publish() {
    const snapshot = getReports();
    subscribers.forEach((subscriber) => subscriber(snapshot));
    options.dispatch?.({ reports: snapshot });
  }

  function persist() {
    if (!state) throw new Error("Los datos demo todavía no están inicializados.");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    publish();
  }

  async function initialize() {
    if (!isEnabled()) return null;
    if (initialization) return initialization;
    initialization = (async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        state = normalizeState(JSON.parse(saved));
        return state;
      }
      if (typeof options.loadSeed !== "function") {
        throw new Error("No hay datos iniciales disponibles para el modo demo.");
      }
      state = normalizeState(await options.loadSeed());
      persist();
      return state;
    })();
    return initialization;
  }

  function withPhoto(report) {
    let photoPreview = null;
    try {
      photoPreview = localStorage.getItem(`${PHOTO_PREFIX}${report.id}`);
    } catch (error) {
      console.warn("No se pudo leer la vista previa local de la fotografía.", error);
    }
    return { ...report, foto_preview: photoPreview };
  }

  function getReports({ ownerId = null } = {}) {
    if (!state) return [];
    return state.reportes
      .filter((report) => !ownerId || report.ownerId === ownerId)
      .map(withPhoto);
  }

  function getSession() {
    const value = sessionStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  }

  function loginAs(role) {
    if (!isEnabled()) throw new Error("Activa explícitamente el modo demo antes de ingresar.");
    if (!["ciudadano", "administrador"].includes(role)) {
      throw new Error("El rol de demostración no es válido.");
    }
    const user = role === "ciudadano"
      ? { id: "demo-ciudadano", nombre_completo: "Ciudadano Demo" }
      : { id: "demo-administrador", nombre_completo: "Administrador Demo" };
    const session = { mode: "demo", role, user };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getReportById(id) {
    const report = state?.reportes.find((item) => item.id === String(id));
    return report ? withPhoto(report) : null;
  }

  function getHistory(id) {
    return getReportById(id)?.historial_estados || [];
  }

  async function createReport(input) {
    await initialize();
    const session = getSession();
    if (!session || session.role !== "ciudadano") {
      throw new Error("Inicia sesión como ciudadano demo para crear un reporte.");
    }

    const type = String(input.tipo_problema || "").trim();
    const description = String(input.descripcion || "").trim();
    const address = String(input.direccion_texto || "").trim();
    const latitudeInput = String(input.latitud ?? "").trim();
    const longitudeInput = String(input.longitud ?? "").trim();
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (!type || !description || !address || !latitudeInput || !longitudeInput
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Completa tipo, descripción, dirección y una ubicación válida.");
    }

    let preview = input.photoPreview || null;
    if (!preview && input.photoFile) {
      if (!input.photoFile.size || input.photoFile.size > 5 * 1024 * 1024) {
        throw new Error("La fotografía debe tener contenido y pesar máximo 5 MB.");
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(input.photoFile.type)) {
        throw new Error("La fotografía debe ser JPEG, PNG o WebP.");
      }
      if (typeof options.makePhotoPreview !== "function") {
        throw new Error("No se puede generar la vista previa local de la fotografía.");
      }
      preview = await options.makePhotoPreview(input.photoFile);
    }
    if (!preview) throw new Error("Selecciona una fotografía para el reporte.");

    reportSequence += 1;
    const now = new Date().toISOString();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const id = `MC-D-${Date.now().toString(36)}-${reportSequence.toString(36)}-${randomSuffix}`;
    const report = normalizeReport({
      id,
      ownerId: session.user.id,
      id_usuario: session.user.id,
      reportadoPor: session.user.nombre_completo,
      tipo_problema: type,
      categoria: type,
      descripcion: description,
      direccion_texto: address,
      latitud: latitude,
      longitud: longitude,
      fecha_creacion: now,
      fecha: now,
      estado_atencion: "pendiente",
      estado: "pendiente",
      historial_estados: [{
        estado: "pendiente",
        fecha_cambio: now,
        observacion: "Reporte creado en la demostración.",
        actor: session.user.nombre_completo,
      }],
    }, state.reportes.length);

    localStorage.setItem(`${PHOTO_PREFIX}${id}`, preview);
    state.reportes.unshift(report);
    persist();
    return withPhoto(report);
  }

  function updateReport(id, status, observation = "") {
    const nextStatus = normalizeStatus(status);
    if (!ALLOWED_STATUSES.has(nextStatus)) throw new Error("El estado seleccionado no es válido.");
    const report = state?.reportes.find((item) => item.id === String(id));
    if (!report) throw new Error(`No se encontró el reporte ${id}.`);

    const session = getSession();
    if (!session || session.role !== "administrador") {
      throw new Error("Inicia sesión como administrador demo para actualizar reportes.");
    }
    const note = String(observation || "").trim();
    if (report.estado_atencion === nextStatus && !note) {
      throw new Error("Selecciona un estado distinto o agrega una observación.");
    }

    const now = new Date().toISOString();
    report.estado = nextStatus;
    report.estado_atencion = nextStatus;
    report.updated_at = now;
    report.historial_estados.push({
      estado: nextStatus,
      fecha_cambio: now,
      observacion: note,
      actor: session.user.nombre_completo,
    });
    persist();
    return withPhoto(report);
  }

  function getStatistics() {
    return [
      { id: "total", etiqueta: "Total de reportes", indicador: "Todos los casos", nota: "Reportes recibidos", icono: "blue" },
      { id: "en_proceso", etiqueta: "En proceso", indicador: "En seguimiento", nota: "Casos en atención", icono: "indigo" },
      { id: "pendiente", etiqueta: "Pendientes", indicador: "Requieren atención", nota: "Por revisar", icono: "amber" },
      { id: "reparado", etiqueta: "Reparados", indicador: "Atendidos", nota: "Incidencias solucionadas", icono: "green" },
    ];
  }

  function response(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => data };
  }

  async function request(path, requestOptions = {}) {
    await initialize();
    const url = new URL(path, "http://mi-calle-demo.local");
    if (url.pathname !== "/reportes") return response({ error: "Ruta demo no disponible." }, 404);
    if ((requestOptions.method || "GET").toUpperCase() === "GET") {
      const session = getSession();
      const reports = url.searchParams.get("mine") === "true"
        ? (session?.role === "ciudadano" ? getReports({ ownerId: session.user.id }) : [])
        : getReports();
      return response(reports);
    }
    if ((requestOptions.method || "GET").toUpperCase() === "POST") {
      const form = requestOptions.body;
      if (!form || typeof form.get !== "function") {
        return response({ error: "El formulario demo debe enviarse como FormData." }, 400);
      }
      const report = await createReport({
        tipo_problema: form.get("tipo_problema") || form.get("tipo"),
        descripcion: form.get("descripcion"),
        direccion_texto: form.get("direccion_texto"),
        latitud: form.get("latitud"),
        longitud: form.get("longitud"),
        photoFile: form.get("fotografia"),
      });
      return response({ id_reporte: report.id_reporte }, 201);
    }
    return response({ error: "Método demo no disponible." }, 405);
  }

  function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }

  function acceptExternalState(value) {
    try {
      if (value === null) {
        state = null;
        initialization = null;
        initialize().then(() => subscribers.forEach((subscriber) => subscriber(getReports())))
          .catch((error) => console.error("No se pudieron recargar los datos demo.", error));
        return;
      }
      state = normalizeState(JSON.parse(value));
      subscribers.forEach((subscriber) => subscriber(getReports()));
    } catch (error) {
      console.error("No se pudieron sincronizar los datos demo de otra pestaña.", error);
    }
  }

  async function reset() {
    localStorage.removeItem(STORAGE_KEY);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(PHOTO_PREFIX)) localStorage.removeItem(key);
    }
    state = null;
    initialization = null;
    await initialize();
    publish();
  }

  function disable() {
    localStorage.removeItem("mi-calle-demo-enabled");
    sessionStorage.removeItem(SESSION_KEY);
  }

  return {
    storageKey: STORAGE_KEY,
    ready: Promise.resolve(null),
    initialize,
    isEnabled,
    loginAs,
    logout,
    getSession,
    getReports,
    getPublicReports: () => getReports(),
    getUserReports: () => {
      const session = getSession();
      return session?.role === "ciudadano" ? getReports({ ownerId: session.user.id }) : [];
    },
    getReportById,
    getHistory,
    createReport,
    updateReport,
    getStatistics,
    request,
    subscribe,
    acceptExternalState,
    reset,
    disable,
  };
});

function installDemoBanner(root, service) {
  if (!service.isEnabled() || !root.document.body || root.document.querySelector("[data-demo-banner]")) return;
  const banner = root.document.createElement("aside");
  banner.dataset.demoBanner = "true";
  banner.setAttribute("role", "status");
  banner.style.cssText = "position:relative;z-index:10000;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:9px 14px;background:#102a43;color:#fff;font:600 14px/1.4 Arial,sans-serif";
  const label = root.document.createElement("span");
  label.textContent = "Modo demostración local: los cambios no se guardan en Supabase.";
  const reset = root.document.createElement("button");
  reset.type = "button";
  reset.textContent = "Restablecer datos demo";
  const exit = root.document.createElement("button");
  exit.type = "button";
  exit.textContent = "Salir del modo demo";
  [reset, exit].forEach((button) => {
    button.style.cssText = "border:1px solid #fff;border-radius:4px;padding:5px 9px;background:transparent;color:#fff;cursor:pointer";
  });
  reset.addEventListener("click", async () => {
    if (!root.confirm("¿Restablecer los datos de demostración de este navegador?")) return;
    await service.reset();
    root.location.reload();
  });
  exit.addEventListener("click", () => {
    service.disable();
    root.location.href = root.location.pathname;
  });
  banner.append(label, reset, exit);
  root.document.body.prepend(banner);
}

async function makePhotoPreview(root, file) {
  const image = await root.createImageBitmap(file);
  const maxDimension = 1280;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = root.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob) throw new Error("No se pudo preparar la vista previa local de la fotografía.");
  return new Promise((resolve, reject) => {
    const reader = new root.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer la vista previa de la fotografía."));
    reader.readAsDataURL(blob);
  });
}
