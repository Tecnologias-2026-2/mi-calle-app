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
   * reporter?: {id: string|null, name: string|null, phone: string|null}}} ReportDto
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
  const REFRESH_TOKEN_KEY = "mi-calle-refresh-token";
  const USER_KEY = "mi-calle-user";
  const allowedStatuses = new Set(["pendiente", "en_revision", "en_proceso", "reparado"]);
  let refreshPromise = null;

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
      const phone = source.reporter?.phone || source.telefono_reportante || source.telefono || null;
      if (name || phone || source.id_usuario || source.reporter?.id) {
        report.reporter = {
          id: source.reporter?.id || source.id_usuario || null,
          name,
          phone,
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
    let refreshToken = null;
    try {
      const rawUser = localStorage?.getItem(USER_KEY) || sessionStorage?.getItem(USER_KEY);
      user = rawUser ? JSON.parse(rawUser) : null;
      refreshToken = localStorage?.getItem(REFRESH_TOKEN_KEY)
        || sessionStorage?.getItem(REFRESH_TOKEN_KEY)
        || null;
    } catch (error) {
      throw new ServiceError(`No se pudo leer el usuario guardado: ${error.message}`, null, "invalid_session");
    }
    const normalized = normalizeSession(user, "render");
    return normalized ? { ...normalized, accessToken: token, refreshToken } : null;
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
    const publicSession = { ...session };
    delete publicSession.accessToken;
    delete publicSession.refreshToken;
    return publicSession;
  }

  function requireLegacyToken() {
    const session = readLegacySession();
    if (!session?.accessToken) {
      throw new ServiceError("La sesión de Render no está activa.", 401, "session_required");
    }
    return session.accessToken;
  }

  function getSessionTokens(result = {}) {
    const session = result.session && typeof result.session === "object"
      ? result.session
      : {};
    return {
      accessToken: session.access_token
        || (typeof result.session === "string" ? result.session : null)
        || result.access_token
        || null,
      refreshToken: session.refresh_token || result.refresh_token || null,
    };
  }

  function persistSession(result) {
    const { accessToken, refreshToken } = getSessionTokens(result);
    if (!accessToken) {
      throw new ServiceError("La respuesta no contiene un access token de Supabase.", null, "invalid_response");
    }
    localStorage.setItem(SESSION_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    if (result.user) localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    sessionStorage?.removeItem(SESSION_KEY);
    sessionStorage?.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage?.removeItem(USER_KEY);
    return accessToken;
  }

  function clearStoredSession() {
    [SESSION_KEY, REFRESH_TOKEN_KEY, USER_KEY].forEach((key) => {
      localStorage?.removeItem(key);
      sessionStorage?.removeItem(key);
    });
  }

  async function refreshLegacySession() {
    const refreshToken = localStorage?.getItem(REFRESH_TOKEN_KEY)
      || sessionStorage?.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const response = await fetchRequest(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 400 || response.status === 401) clearStoredSession();
        throw new ServiceError(
          data.error || `No se pudo renovar la sesión (HTTP ${response.status}).`,
          response.status,
          "refresh_failed",
        );
      }
      return persistSession(data);
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  async function legacyFetch(path, init = {}, authenticated = false) {
    const headers = new Headers(init.headers || {});
    const token = authenticated ? requireLegacyToken() : null;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response = await fetchRequest(`${API_BASE_URL}${path}`, { ...init, headers });
    if (authenticated && response.status === 401) {
      const refreshedToken = await refreshLegacySession();
      if (refreshedToken) {
        headers.set("Authorization", `Bearer ${refreshedToken}`);
        response = await fetchRequest(`${API_BASE_URL}${path}`, { ...init, headers });
      }
    }
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

  function requireAdministratorSession() {
    const session = getCurrentSession();
    if (session?.user.role !== "administrador") {
      throw new ServiceError("Se requiere una sesión de administrador.", 403, "forbidden");
    }
    return session;
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
    const result = await legacyFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(credentials.email || "").trim().toLowerCase(),
        password: credentials.password,
      }),
    });
    const { accessToken } = getSessionTokens(result);
    if (!accessToken || !result.user) {
      throw new ServiceError("La respuesta de inicio de sesión no contiene sesión y usuario.", null, "invalid_response");
    }
    const actualRole = result.user.role || result.user.rol;
    if (credentials.role === "administrador" && actualRole !== "administrador") {
      throw new ServiceError("La cuenta no tiene rol de administrador.", 403, "forbidden");
    }
    persistSession(result);
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
    if (result.user && getSessionTokens(result).accessToken) persistSession(result);
    return responseDto({
      message: result.message || "",
      user: result.user || null,
      authenticated: Boolean(result.user && getSessionTokens(result).accessToken),
    }, provider);
  }

  async function logout() {
    const provider = getProvider();
    if (provider === "demo") {
      demo.logout();
      return responseDto(null, provider);
    }
    clearStoredSession();
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
    if (provider === "demo") {
      const session = getCurrentSession();
      if (session?.user.role !== "administrador") {
        throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
      }
      await demo.initialize();
      return demo.getReports().map((report) => normalizeReport(report, { includeReporter: true }));
    }

    requireAdministratorSession();
    const reports = asArray(await legacyFetch("/reportes", {}, true), "reportes administrativos");
    return Promise.all(reports.map(async (report) => {
      const id = String(report.id_reporte || report.id || "");
      if (!id) throw new ServiceError("Un reporte no contiene identificador.", null, "invalid_response");
      const [history, identity] = await Promise.all([
        getReportHistory(id),
        legacyFetch(`/api/admin/reportes/${encodeURIComponent(id)}/reportante`, {}, true),
      ]);
      return normalizeReport({
        ...report,
        history,
        reporter: {
          id: identity.id_usuario,
          name: identity.nombre_completo,
          phone: identity.telefono,
        },
      }, { includeReporter: true });
    }));
  }

  async function getAdminStatistics(reports = null) {
    const provider = getProvider();
    if (provider === "demo") {
      if (getCurrentSession()?.user.role !== "administrador") {
        throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
      }
      await demo.initialize();
      return demo.getStatistics();
    }
    requireAdministratorSession();
    const sourceReports = reports === null
      ? asArray(await legacyFetch("/reportes", {}, true), "estadísticas administrativas")
      : asArray(reports, "estadísticas administrativas");
    const counts = sourceReports.reduce((result, source) => {
      const status = normalizeReport(source).status;
      result.total += 1;
      result[status] += 1;
      return result;
    }, { total: 0, pendiente: 0, en_revision: 0, en_proceso: 0, reparado: 0 });
    return [
      { id: "total", etiqueta: "Total de reportes", indicador: "Todos los casos", nota: "Reportes recibidos", icono: "blue", count: counts.total },
      { id: "pendiente", etiqueta: "Pendientes", indicador: "Requieren atención", nota: "Por revisar", icono: "amber", count: counts.pendiente },
      { id: "en_proceso", etiqueta: "En atención", indicador: "En seguimiento", nota: "Casos en revisión o proceso", icono: "indigo", count: counts.en_revision + counts.en_proceso },
      { id: "reparado", etiqueta: "Reparados", indicador: "Atendidos", nota: "Incidencias solucionadas", icono: "green", count: counts.reparado },
    ];
  }

  async function getReportById(id) {
    const provider = getProvider();
    if (provider === "demo") {
      await demo.initialize();
      const report = demo.getReportById(id);
      return report ? normalizeReport(report) : null;
    }
    try {
      const report = await legacyFetch(`/reportes/${encodeURIComponent(id)}`);
      return normalizeReport(report);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function getReportHistory(id) {
    const provider = getProvider();
    if (provider === "demo") {
      await demo.initialize();
      return demo.getHistory(id).map((entry) => normalizeHistory(entry));
    }
    const history = asArray(
      await legacyFetch(`/reportes/${encodeURIComponent(id)}/historial`),
      "historial del reporte",
    );
    return history.map((entry) => normalizeHistory(entry));
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
    const nextStatus = normalizeStatus(status);
    if (provider === "demo") {
      if (getCurrentSession()?.user.role !== "administrador") {
        throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
      }
      const report = demo.updateReport(id, nextStatus, observation);
      return responseDto(normalizeReport(report, { includeReporter: true }), provider);
    }

    requireAdministratorSession();
    const reports = asArray(await legacyFetch("/reportes", {}, true), "reportes administrativos");
    const currentSource = reports.find((report) => String(report.id_reporte || report.id || "") === String(id));
    if (!currentSource) throw new ServiceError(`No se encontró el reporte ${id}.`, 404, "not_found");
    const currentReport = normalizeReport(currentSource);
    if (currentReport.status === nextStatus) {
      throw new ServiceError(
        "Selecciona un estado distinto; V11.1 solo registra observaciones junto con ese cambio.",
        409,
        "status_unchanged",
      );
    }
    await legacyFetch(`/api/admin/reportes/${encodeURIComponent(id)}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_atencion: nextStatus, observation }),
    }, true);
    return responseDto(normalizeReport({
      ...currentReport,
      estado_atencion: nextStatus
    }), provider);
  }

  async function saveAdminObservation(id, observation, status = null) {
    const provider = getProvider();
    if (provider === "demo") {
      if (getCurrentSession()?.user.role !== "administrador") {
        throw new ServiceError("Se requiere una sesión de administrador demo.", 403, "forbidden");
      }
      const report = demo.getReportById(id);
      if (!report) throw new ServiceError(`No se encontró el reporte ${id}.`, 404, "not_found");
      const updated = demo.updateReport(id, report.estado_atencion, observation);
      return responseDto(normalizeReport(updated, { includeReporter: true }), provider);
    }

    requireAdministratorSession();
    if (!status) {
      throw new ServiceError(
        "V11.1 solo persiste observaciones junto con una transición; indica el nuevo estado.",
        409,
        "observation_requires_status_change",
      );
    }
    return updateReportStatus(id, status, observation);
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
