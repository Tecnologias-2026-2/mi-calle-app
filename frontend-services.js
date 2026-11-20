(function attachFrontendServices(root, createServices) {
  if (typeof module === "object" && module.exports) {
    module.exports = createServices;
  }
  if (!root || !root.document) return;

  root.MiCalleServices = createServices({
    demo: root.MiCalleDemo,
    fetch: root.fetch.bind(root),
    localStorage: root.localStorage,
    sessionStorage: root.sessionStorage,
    location: root.location,
  });
})(typeof window === "undefined" ? null : window, function createServices(options = {}) {
  /**
   * @typedef {{id: string, type: string, description: string, status: string,
   * createdAt: string|null, updatedAt: string|null,
   * location: {latitude: number|null, longitude: number|null, address: string},
   * photo: {url: string|null, storagePath: string|null}, history: HistoryDto[],
   * reporter?: {id: string|null, name: string|null}}} ReportDto
   * @typedef {{id: string|null, status: string, changedAt: string|null,
   * observation: string}} HistoryDto
   * @typedef {{mode: "demo"|"render", user: {id: string|null, name: string|null,
   * email: string|null, role: string|null, phone: string|null},
   * expiresAt: string|null}} SessionDto
   * @typedef {{ok: true, data: *, provider: "demo"|"render"}} OperationResultDto
   */
  const demo = options.demo;
  const fetchRequest = options.fetch || globalThis.fetch;
  const localStorage = options.localStorage;
  const sessionStorage = options.sessionStorage;
  const location = options.location || { search: "" };
  const API_BASE_URL = "https://mi-calle-app-backend.onrender.com";
  const SESSION_KEY = "mi-calle-session";
  const USER_KEY = "mi-calle-user";
  const allowedStatuses = new Set(["pendiente", "en_revision", "en_proceso", "reparado"]);

  class ServiceError extends Error {
    constructor(message, status = null, code = "service_error") {
      super(message);
      this.name = "ServiceError";
      this.status = status;
      this.code = code;
    }
  }

  function getProvider() {
    const requestedProvider = new URLSearchParams(location.search || "").get("provider");
    if (requestedProvider === "supabase") {
      throw new ServiceError("El proveedor Supabase todavía no está implementado.", null, "provider_unavailable");
    }
    if (requestedProvider && !["demo", "render"].includes(requestedProvider)) {
      throw new ServiceError(`Proveedor frontend no reconocido: ${requestedProvider}.`, null, "provider_unavailable");
    }
    const demoEnabled = Boolean(demo?.isEnabled());
    if (requestedProvider === "demo" && !demoEnabled) {
      throw new ServiceError("El proveedor demo requiere activación explícita con ?demo=1.", null, "provider_not_enabled");
    }
    if (requestedProvider === "render" && demoEnabled) {
      throw new ServiceError("La selección Render no puede coexistir con el modo demo activado.", null, "provider_conflict");
    }
    return demoEnabled ? "demo" : "render";
  }

  function normalizeStatus(value) {
    const status = String(value || "pendiente").trim().toLowerCase();
    const normalized = ({
      reportado: "pendiente",
      proceso: "en_proceso",
      "en proceso": "en_proceso",
      "en revisión": "en_revision",
      resuelto: "reparado",
    })[status] || status;
    if (!allowedStatuses.has(normalized)) {
      throw new ServiceError(`Estado de reporte no reconocido: ${status}.`, null, "invalid_status");
    }
    return normalized;
  }

  function normalizeHistory(entry = {}, createdAt = null) {
    return {
      id: entry.id_historial || entry.id || null,
      status: normalizeStatus(entry.estado || entry.status),
      changedAt: entry.fecha_cambio || entry.changedAt || createdAt,
      observation: String(entry.observacion || entry.observation || ""),
    };
  }

  function normalizeReport(source = {}, { includeReporter = false } = {}) {
    const createdAt = source.fecha_creacion || source.createdAt || source.fecha || null;
    const coordinates = source.coordenadas || source.location || {};
    const latitudeValue = source.latitud ?? coordinates.latitude ?? coordinates.latitud;
    const longitudeValue = source.longitud ?? coordinates.longitude ?? coordinates.longitud;
    const latitude = latitudeValue == null || latitudeValue === "" ? null : Number(latitudeValue);
    const longitude = longitudeValue == null || longitudeValue === "" ? null : Number(longitudeValue);
    const historySource = source.historial_estados || source.history || [];
    const photo = source.photo || {};
    const report = {
      id: String(source.id_reporte || source.id || ""),
      type: String(source.tipo_problema || source.type || source.categoria || source.tipo || "Otro"),
      description: String(source.descripcion || source.description || ""),
      status: normalizeStatus(source.estado_atencion || source.status || source.estado),
      createdAt,
      updatedAt: source.updated_at || source.updatedAt || createdAt,
      location: {
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        address: String(source.direccion_texto || source.address || source.ubicacion?.direccion_texto
          || (typeof source.ubicacion === "string" ? source.ubicacion : "") || ""),
      },
      photo: {
        url: photo.url || source.foto_preview || source.fotografia_url || source.photo_url || null,
        storagePath: photo.storagePath || source.storage_path || null,
      },
      history: Array.isArray(historySource)
        ? historySource.map((entry) => normalizeHistory(entry, createdAt))
        : [],
    };

    if (includeReporter) {
      const name = source.reporter?.name || source.reportadoPor || source.nombre_reportante || null;
      if (name || source.id_usuario || source.reporter?.id) {
        report.reporter = {
          id: source.reporter?.id || source.id_usuario || null,
          name,
        };
      }
    }
    return report;
  }

  function normalizeSession(user, mode) {
    if (!user) return null;
    const role = user.role || user.rol || null;
    return {
      mode,
      user: {
        id: user.id || user.id_usuario || null,
        name: user.nombre_completo || user.name || null,
        email: user.email || user.correo_electronico || null,
        role,
        phone: user.telefono || user.phone || null,
      },
      expiresAt: null,
    };
  }

  function responseDto(data, provider = getProvider()) {
    return { ok: true, data, provider };
  }

  function readLegacySession() {
    const token = localStorage?.getItem(SESSION_KEY) || sessionStorage?.getItem(SESSION_KEY) || null;
    if (!token) return null;
    let user = null;
    try {
      const rawUser = localStorage?.getItem(USER_KEY) || sessionStorage?.getItem(USER_KEY);
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch (error) {
      throw new ServiceError(`No se pudo leer el usuario guardado: ${error.message}`, null, "invalid_session");
    }
    const normalized = normalizeSession(user, "render");
    return normalized ? { ...normalized, accessToken: token } : null;
  }

  function getCurrentSession() {
    const provider = getProvider();
    if (provider === "demo") {
      const session = demo.getSession();
      if (!session || session.mode !== "demo") return null;
      return normalizeSession({ ...session.user, role: session.role }, "demo");
    }
    const session = readLegacySession();
    if (!session) return null;
    const { accessToken, ...publicSession } = session;
    return publicSession;
  }

  function requireLegacyToken() {
    const session = readLegacySession();
    if (!session?.accessToken) {
      throw new ServiceError("La sesión de Render no está activa.", 401, "session_required");
    }
    return session.accessToken;
  }

  async function legacyFetch(path, init = {}, authenticated = false) {
    const headers = new Headers(init.headers || {});
    if (authenticated) headers.set("Authorization", `Bearer ${requireLegacyToken()}`);
    const response = await fetchRequest(`${API_BASE_URL}${path}`, { ...init, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceError(data.error || `Error HTTP ${response.status}`, response.status, "http_error");
    }
    return data;
  }

  function asArray(value, operation) {
    if (!Array.isArray(value)) {
      throw new ServiceError(`La respuesta de ${operation} no contiene una lista.`, null, "invalid_response");
    }
    return value;
  }

  async function login(credentials = {}) {
    const provider = getProvider();
    if (provider === "demo") {
      if (!credentials.role) {
        throw new ServiceError("Usa el acceso de ciudadano o administrador demo.", null, "demo_login_requires_role");
      }
      const session = demo.loginAs(credentials.role);
      return responseDto(normalizeSession({ ...session.user, role: session.role }, "demo"), provider);
    }
    if (credentials.role === "administrador") {
      throw new ServiceError("El inicio de sesión administrativo de Render no está conectado.", null, "operation_unavailable");
    }

    const result = await legacyFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(credentials.email || "").trim().toLowerCase(),
        password: credentials.password,
      }),
    });
    if (!result.session || !result.user) {
      throw new ServiceError("La respuesta de inicio de sesión no contiene sesión y usuario.", null, "invalid_response");
    }
    localStorage.setItem(SESSION_KEY, result.session);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return responseDto(normalizeSession(result.user, "render"), provider);
  }

  async function register(input = {}) {
    const provider = getProvider();
    if (provider === "demo") {
      throw new ServiceError("El registro real está desactivado en modo demo.", null, "operation_unavailable");
    }
    const result = await legacyFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_completo: input.username,
        email: String(input.email || "").trim().toLowerCase(),
        password: input.password,
      }),
    });
    return responseDto({ message: result.message || "" }, provider);
  }

  async function logout() {
    const provider = getProvider();
    if (provider === "demo") {
      demo.logout();
      return responseDto(null, provider);
    }
    localStorage?.removeItem(SESSION_KEY);
    localStorage?.removeItem(USER_KEY);
    sessionStorage?.removeItem(SESSION_KEY);
    sessionStorage?.removeItem(USER_KEY);
    return responseDto(null, provider);
  }

  async function getPublicReports() {
    const provider = getProvider();
    const data = provider === "demo"
      ? (await demo.initialize(), demo.getPublicReports())
      : asArray(await legacyFetch("/reportes"), "reportes públicos");
    return data.map((report) => normalizeReport(report));
  }

  async function getMyReports() {
    const provider = getProvider();
    if (provider === "demo") {
      const session = getCurrentSession();
      if (session?.user.role !== "ciudadano") {
        throw new ServiceError("Se requiere una sesión de ciudadano demo.", 403, "forbidden");
      }
      await demo.initialize();
      return demo.getUserReports().map((report) => normalizeReport(report));
    }
    const data = asArray(await legacyFetch("/reportes?mine=true", {}, true), "mis reportes");
    return data.map((report) => normalizeReport(report));
  }

  async function getAdminReports() {
    const provider = getProvider();
    if (provider !== "demo") {
      throw new ServiceError("El adaptador Render no ofrece consultas administrativas.", null, "operation_unavailable");
    }
    const session = getCurrentSession();
    if (session?.user.role !== "administrador") {
      throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
    }
    await demo.initialize();
    return demo.getReports().map((report) => normalizeReport(report, { includeReporter: true }));
  }

  async function getAdminStatistics() {
    if (getProvider() !== "demo") {
      throw new ServiceError("El adaptador Render no ofrece estadísticas administrativas.", null, "operation_unavailable");
    }
    if (getCurrentSession()?.user.role !== "administrador") {
      throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
    }
    await demo.initialize();
    return demo.getStatistics();
  }

  async function getReportById(id) {
    const provider = getProvider();
    if (provider === "demo") {
      await demo.initialize();
      const report = demo.getReportById(id);
      return report ? normalizeReport(report) : null;
    }
    const reports = asArray(await legacyFetch("/reportes"), "detalle del reporte");
    const found = reports.find((report) => String(report.id_reporte || report.id) === String(id));
    return found ? normalizeReport(found) : null;
  }

  async function getReportHistory(id) {
    const provider = getProvider();
    if (provider === "demo") {
      await demo.initialize();
      return demo.getHistory(id).map((entry) => normalizeHistory(entry));
    }
    const report = await getReportById(id);
    return report?.history || [];
  }

  async function createReport(input = {}) {
    const provider = getProvider();
    const payload = {
      type: String(input.type || input.tipo_problema || "").trim(),
      description: String(input.description || input.descripcion || "").trim(),
      location: {
        latitude: input.location?.latitude ?? input.latitud,
        longitude: input.location?.longitude ?? input.longitud,
        address: String(input.location?.address || input.direccion_texto || "").trim(),
      },
      photoFile: input.photoFile || input.fotografia || null,
    };
    if (provider === "demo") {
      const report = await demo.createReport({
        tipo_problema: payload.type,
        descripcion: payload.description,
        direccion_texto: payload.location.address,
        latitud: payload.location.latitude,
        longitud: payload.location.longitude,
        photoFile: payload.photoFile,
      });
      return responseDto({ report: normalizeReport(report), reportId: report.id_reporte }, provider);
    }

    const form = new FormData();
    form.append("tipo", payload.type);
    form.append("tipo_problema", payload.type);
    form.append("descripcion", payload.description);
    form.append("direccion_texto", payload.location.address);
    form.append("latitud", String(payload.location.latitude ?? ""));
    form.append("longitud", String(payload.location.longitude ?? ""));
    if (payload.photoFile) form.append("fotografia", payload.photoFile);
    const result = await legacyFetch("/reportes", { method: "POST", body: form }, true);
    const reportId = result.id_reporte || result.id || null;
    return responseDto({
      reportId: reportId == null ? null : String(reportId),
      report: reportId == null ? null : normalizeReport({ ...payload, id: reportId }),
    }, provider);
  }

  async function updateReportStatus(id, status, observation = "") {
    const provider = getProvider();
    if (provider !== "demo") {
      throw new ServiceError("El adaptador Render no ofrece actualización administrativa.", null, "operation_unavailable");
    }
    if (getCurrentSession()?.user.role !== "administrador") {
      throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
    }
    const report = demo.updateReport(id, status, observation);
    return responseDto(normalizeReport(report, { includeReporter: true }), provider);
  }

  async function saveAdminObservation(id, observation) {
    const provider = getProvider();
    if (provider !== "demo") {
      throw new ServiceError("El adaptador Render no ofrece observaciones administrativas.", null, "operation_unavailable");
    }
    if (getCurrentSession()?.user.role !== "administrador") {
      throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
    }
    const report = demo.getReportById(id);
    if (!report) throw new ServiceError(`No se encontró el reporte ${id}.`, 404, "not_found");
    const updated = demo.updateReport(id, report.estado_atencion, observation);
    return responseDto(normalizeReport(updated, { includeReporter: true }), provider);
  }

  function subscribePublicReports(callback) {
    if (getProvider() !== "demo") return () => {};
    return demo.subscribe((reports) => callback(reports.map((report) => normalizeReport(report))));
  }

  function subscribeMyReports(callback) {
    if (getProvider() !== "demo") return () => {};
    return demo.subscribe(() => {
      getMyReports().then(callback).catch((error) => console.error("No se pudieron actualizar Mis reportes.", error));
    });
  }

  function subscribeAdminReports(callback) {
    if (getProvider() !== "demo") return () => {};
    return demo.subscribe(() => {
      getAdminReports().then(callback).catch((error) => console.error("No se pudo actualizar el panel administrativo.", error));
    });
  }

  async function resetDemoData() {
    if (getProvider() !== "demo") {
      throw new ServiceError("El restablecimiento solo está disponible en modo demo.", null, "operation_unavailable");
    }
    await demo.reset();
  }

  return {
    ServiceError,
    get provider() { return getProvider(); },
    normalizeReport,
    normalizeHistory,
    login,
    register,
    logout,
    getCurrentSession,
    getPublicReports,
    getMyReports,
    getAdminReports,
    getAdminStatistics,
    getReportById,
    getReportHistory,
    createReport,
    updateReportStatus,
    saveAdminObservation,
    subscribePublicReports,
    subscribeMyReports,
    subscribeAdminReports,
    resetDemoData,
  };
});
