(function attachFrontendServices(root, createServices) {
  if (typeof module === "object" && module.exports) {
    module.exports = createServices;
  }
  if (!root || !root.document) return;

  root.MiCalleServices = createServices({
    fetch: root.fetch.bind(root),
    localStorage: root.localStorage,
    sessionStorage: root.sessionStorage,
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
   * @typedef {{mode: "render", user: {id: string|null, name: string|null,
   * email: string|null, role: string|null, phone: string|null},
   * expiresAt: string|null}} SessionDto
   * @typedef {{ok: true, data: *, provider: "render"}} OperationResultDto
   */
  const fetchRequest = options.fetch || globalThis.fetch;
  const localStorage = options.localStorage;
  const sessionStorage = options.sessionStorage;
  const API_BASE_URL = "https://mi-calle-app-backend.onrender.com";
  const SESSION_KEY = "mi-calle-session";
  const REFRESH_TOKEN_KEY = "mi-calle-refresh-token";
  const USER_KEY = "mi-calle-user";
  const allowedStatuses = new Set(["pendiente", "en_revision", "en_proceso", "reparado", "descartado"]);
  let refreshPromise = null;

  class ServiceError extends Error {
    constructor(message, status = null, code = "service_error") {
      super(message);
      this.name = "ServiceError";
      this.status = status;
      this.code = code;
    }
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

  function getLatestObservation(history) {
    return [...history]
      .reverse()
      .find((entry) => entry.observation.trim())?.observation.trim() || "";
  }

  function normalizeHistoryList(entries, createdAt = null) {
    return entries
      .map((entry) => normalizeHistory(entry, createdAt))
      .sort((first, second) => {
        const firstTime = Date.parse(first.changedAt || "");
        const secondTime = Date.parse(second.changedAt || "");
        if (!Number.isFinite(firstTime)) return Number.isFinite(secondTime) ? -1 : 0;
        if (!Number.isFinite(secondTime)) return 1;
        return firstTime - secondTime;
      });
  }

  function normalizeReport(source = {}, { includeReporter = false } = {}) {
    const createdAt = source.fecha_creacion || source.created_at || source.createdAt || source.fecha || null;
    const coordinates = source.coordenadas || source.location || {};
    const latitudeValue = source.latitud ?? coordinates.latitude ?? coordinates.latitud;
    const longitudeValue = source.longitud ?? coordinates.longitude ?? coordinates.longitud;
    const latitude = latitudeValue == null || latitudeValue === "" ? null : Number(latitudeValue);
    const longitude = longitudeValue == null || longitudeValue === "" ? null : Number(longitudeValue);
    const historySource = [
      source.historial_estados,
      source.historial_estados_publico,
      source.history,
    ].find((entries) => Array.isArray(entries) && entries.length) || [];
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
      history: Array.isArray(historySource) ? normalizeHistoryList(historySource, createdAt) : [],
    };
    report.latestObservation = getLatestObservation(report.history);

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

  function normalizeSession(user) {
    if (!user) return null;
    const role = user.role || user.rol || null;
    return {
      mode: "render",
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

  function responseDto(data) {
    return { ok: true, data, provider: "render" };
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
    const normalized = normalizeSession(user);
    return normalized ? { ...normalized, accessToken: token, refreshToken } : null;
  }

  function getCurrentSession() {
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
    return responseDto(normalizeSession(result.user));
  }

  async function register(input = {}) {
    const result = await legacyFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_completo: input.username,
        telefono: input.phone || input.telefono,
        email: String(input.email || "").trim().toLowerCase(),
        password: input.password,
      }),
    });
    if (result.user && getSessionTokens(result).accessToken) persistSession(result);
    return responseDto({
      message: result.message || "",
      user: result.user || null,
      authenticated: Boolean(result.user && getSessionTokens(result).accessToken),
    });
  }

  async function resetPasswordForEmail(email, { redirectTo } = {}) {
    const result = await legacyFetch("/api/auth/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(email || "").trim().toLowerCase(),
        redirectTo: String(redirectTo || ""),
      }),
    });
    return responseDto(result);
  }

  async function completePasswordRecovery({ accessToken, refreshToken, type, password } = {}) {
    const result = await legacyFetch("/api/auth/password-recovery/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: String(accessToken || ""),
        refreshToken: String(refreshToken || ""),
        type: String(type || ""),
        password: String(password || ""),
      }),
    });
    return responseDto(result);
  }

  async function changePassword({ currentPassword, newPassword } = {}) {
    const result = await legacyFetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(currentPassword || ""),
        newPassword: String(newPassword || ""),
      }),
    }, true);
    return responseDto(result);
  }

  async function logout() {
    clearStoredSession();
    return responseDto(null);
  }

  async function getPublicReports() {
    const data = asArray(await legacyFetch("/reportes"), "reportes públicos");
    return data.map((report) => normalizeReport(report));
  }

  async function getMyReports() {
    return getUserReports();
  }

  async function getUserReports() {
    const data = asArray(await legacyFetch("/reportes?mine=true", {}, true), "mis reportes");
    return data.map((report) => normalizeReport(report));
  }

  async function getAdminReports() {
    requireAdministratorSession();
    const reports = asArray(await legacyFetch("/reportes", {}, true), "reportes administrativos");
    return Promise.all(reports.map(async (report) => {
      const id = String(report.id_reporte || report.id || "");
      if (!id) throw new ServiceError("Un reporte no contiene identificador.", null, "invalid_response");
      const identity = await legacyFetch(`/api/admin/reportes/${encodeURIComponent(id)}/reportante`, {}, true);
      return normalizeReport({
        ...report,
        reporter: {
          id: identity.id_usuario,
          name: identity.nombre_completo,
          phone: identity.telefono,
        },
      }, { includeReporter: true });
    }));
  }

  async function getAdminStatistics(reports = null) {
    requireAdministratorSession();
    const sourceReports = reports === null
      ? asArray(await legacyFetch("/reportes", {}, true), "estadísticas administrativas")
      : asArray(reports, "estadísticas administrativas");
    const counts = sourceReports.reduce((result, source) => {
      const status = normalizeReport(source).status;
      result.total += 1;
      result[status] += 1;
      return result;
    }, { total: 0, pendiente: 0, en_revision: 0, en_proceso: 0, reparado: 0, descartado: 0 });
    return [
      { id: "total", etiqueta: "Total de reportes", indicador: "Todos los casos", nota: "Reportes recibidos", icono: "blue", count: counts.total },
      { id: "pendiente", etiqueta: "Pendientes", indicador: "Requieren atención", nota: "Por revisar", icono: "amber", count: counts.pendiente },
      { id: "en_proceso", etiqueta: "En atención", indicador: "En seguimiento", nota: "Casos en revisión o proceso", icono: "indigo", count: counts.en_revision + counts.en_proceso },
      { id: "reparado", etiqueta: "Reparados", indicador: "Atendidos", nota: "Incidencias solucionadas", icono: "green", count: counts.reparado },
      { id: "descartado", etiqueta: "Descartados", indicador: "Ocultos del mapa", nota: "Se eliminan en 24 horas", icono: "slate", count: counts.descartado },
    ];
  }

  async function getReportById(id) {
    try {
      const report = await legacyFetch(
        `/reportes/${encodeURIComponent(id)}`,
        {},
        Boolean(getCurrentSession()),
      );
      return normalizeReport(report);
    } catch (error) {
      if (error.status === 404) {
        const session = getCurrentSession();
        if (session?.user.role === "ciudadano") {
          const ownReports = await getMyReports();
          return ownReports.find((report) => report.id === String(id)) || null;
        }
        return null;
      }
      throw error;
    }
  }

  async function getReportHistory(id) {
    const publicHistory = asArray(
      await legacyFetch(`/reportes/${encodeURIComponent(id)}/historial`),
      "historial del reporte",
    );
    let privateHistory = [];
    if (readLegacySession()?.accessToken) {
      try {
        privateHistory = await getPrivateReportHistory(id);
      } catch (error) {
        if (error.status !== 403 && error.status !== 404) throw error;
      }
    }
    const privateById = new Map(privateHistory.map((entry) => [entry.id, entry]));
    return normalizeHistoryList(publicHistory.map((entry) => ({
      ...entry,
      observacion: privateById.get(entry.id_historial)?.observation || entry.observacion,
    })));
  }

  async function getPrivateReportHistory(id) {
    const history = asArray(
      await legacyFetch(`/api/reportes/${encodeURIComponent(id)}/historial`, {}, true),
      "observaciones privadas del reporte",
    );
    return normalizeHistoryList(history);
  }

  function subscribeReports(loader, callback, onError, description) {
    if (typeof callback !== "function") {
      throw new TypeError("La suscripción requiere una función de retorno.");
    }
    let active = true;
    loader()
      .then((reports) => {
        if (active) callback(reports);
      })
      .catch((error) => {
        if (!active) return;
        if (typeof onError === "function") {
          onError(error);
          return;
        }
        console.error(`No se pudieron cargar ${description}:`, error);
      });
    return () => {
      active = false;
    };
  }

  function subscribePublicReports(callback, onError) {
    return subscribeReports(getPublicReports, callback, onError, "los reportes públicos");
  }

  function subscribeUserReports(callback, onError) {
    return subscribeReports(getUserReports, callback, onError, "tus reportes");
  }

  function subscribeAdminReports(callback, onError) {
    return subscribeReports(getAdminReports, callback, onError, "los reportes administrativos");
  }

  async function createReport(input = {}) {
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
    });
  }

  async function updateReportStatus(id, status, observation = "") {
    const nextStatus = normalizeStatus(status);
    const note = String(observation || "").trim();

    requireAdministratorSession();
    if (!note) {
      throw new ServiceError(
        "Escribe una observación que explique el motivo o avance antes de cambiar el estado.",
        400,
        "observation_required",
      );
    }
    const reports = asArray(await legacyFetch("/reportes", {}, true), "reportes administrativos");
    const currentSource = reports.find((report) => String(report.id_reporte || report.id || "") === String(id));
    if (!currentSource) throw new ServiceError(`No se encontró el reporte ${id}.`, 404, "not_found");
    const currentReport = normalizeReport(currentSource);
    if (currentReport.status === nextStatus) {
      throw new ServiceError(
        "Selecciona un estado distinto para registrar la observación junto con el cambio.",
        409,
        "status_unchanged",
      );
    }
    await legacyFetch(`/api/admin/reportes/${encodeURIComponent(id)}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_atencion: nextStatus, observacion: note }),
    }, true);
    return responseDto(normalizeReport({
      ...currentReport,
      estado_atencion: nextStatus
    }));
  }

  async function saveAdminObservation(id, observation, status = null) {
    requireAdministratorSession();
    if (!status) {
      throw new ServiceError(
        "Selecciona el nuevo estado para guardar la observación junto con la transición.",
        409,
        "observation_requires_status_change",
      );
    }
    return updateReportStatus(id, status, observation);
  }

  async function updateAdminProfile({ name, phone } = {}) {
    requireAdministratorSession();

    const result = await legacyFetch("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_completo: String(name || "").trim(),
        telefono: String(phone || "").trim(),
      }),
    }, true);
    if (!result.user) {
      throw new ServiceError("La respuesta de actualización no contiene el usuario.", null, "invalid_response");
    }

    const session = normalizeSession(result.user);
    if (!session) {
      throw new ServiceError("No se pudo normalizar el perfil actualizado.", null, "invalid_response");
    }
    if (!localStorage?.setItem) {
      throw new ServiceError("No se pudo guardar el perfil actualizado en este navegador.", null, "storage_unavailable");
    }
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return responseDto(session.user);
  }

  return {
    ServiceError,
    get provider() { return "render"; },
    normalizeReport,
    normalizeHistory,
    login,
    register,
    resetPasswordForEmail,
    completePasswordRecovery,
    changePassword,
    logout,
    getCurrentSession,
    getPublicReports,
    subscribePublicReports,
    getUserReports,
    subscribeUserReports,
    getMyReports,
    subscribeMyReports: subscribeUserReports,
    getAdminReports,
    subscribeAdminReports,
    getAdminStatistics,
    getReportById,
    getReportHistory,
    createReport,
    updateReportStatus,
    saveAdminObservation,
    updateAdminProfile,
  };
});
