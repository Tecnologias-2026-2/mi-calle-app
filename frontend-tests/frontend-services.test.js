const test = require("node:test");
const assert = require("node:assert/strict");
const createServices = require("../frontend-services");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
  };
}

test("report normalization preserves observations from public and authenticated history payloads", () => {
  const services = createServices({ localStorage: createStorage(), sessionStorage: createStorage() });
  const report = services.normalizeReport({
    id_reporte: "report-1",
    estado_atencion: "en_proceso",
    historial_estados_publico: [{
      id_historial: "history-1",
      estado: "en_proceso",
      fecha_cambio: "2026-11-20T12:00:00Z",
      observacion: "Intervención programada",
    }],
  });

  assert.equal(report.history[0].observation, "Intervención programada");
  assert.equal(report.history[0].changedAt, "2026-11-20T12:00:00Z");
});

test("Render adapter preserves current HTTP paths and maps payloads to normalized DTOs", async () => {
  const calls = [];
  const localStorage = createStorage({
    "mi-calle-session": "render-token",
    "mi-calle-user": JSON.stringify({ id: "citizen-1", nombre_completo: "Ciudadana", role: "ciudadano" }),
  });
  const services = createServices({
    localStorage,
    sessionStorage: createStorage(),
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/reportes?mine=true")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id_reporte: "R-01",
            tipo_problema: "Hueco",
            estado_atencion: "en_proceso",
            fecha_creacion: "2026-11-18T10:00:00Z",
            updated_at: "2026-11-19T10:00:00Z",
            direccion_texto: "Calle 5",
            latitud: 4.6,
            longitud: -74.1,
            descripcion: "Daño",
          }],
        };
      }
      if (url.endsWith("/reportes")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id_reporte: "R-02" }),
        };
      }
      if (url.endsWith("/api/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session: {
              access_token: "new-render-token",
              refresh_token: "new-refresh-token",
            },
            user: { id: "citizen-2", nombre_completo: "Nueva ciudadana", role: "ciudadano" },
          }),
        };
      }
      if (url.endsWith("/api/auth/register")) {
        return { ok: true, status: 200, json: async () => ({ message: "Verifica tu correo." }) };
      }
      throw new Error(`Unexpected request ${url}`);
    },
  });

  const [report] = await services.getMyReports();
  assert.deepEqual(report.location, { latitude: 4.6, longitude: -74.1, address: "Calle 5" });
  assert.equal(report.status, "en_proceso");
  assert.equal(calls[0].url, "https://mi-calle-app-backend.onrender.com/reportes?mine=true");
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer render-token");

  const created = await services.createReport({
    type: "Semáforo",
    description: "Daño",
    location: { latitude: 4.7, longitude: -74.2, address: "Carrera 7" },
    photoFile: new Blob(["img"], { type: "image/jpeg" }),
  });
  assert.equal(created.data.reportId, "R-02");
  assert.equal(calls[1].url, "https://mi-calle-app-backend.onrender.com/reportes");
  assert.equal(calls[1].init.headers.get("Authorization"), "Bearer render-token");
  assert.equal(calls[1].init.body.get("tipo"), "Semáforo");
  assert.equal(calls[1].init.body.get("tipo_problema"), "Semáforo");
  assert.equal(calls[1].init.body.get("latitud"), "4.7");

  const loggedIn = await services.login({ email: " citizen@example.com ", password: "pass" });
  assert.equal(loggedIn.data.user.id, "citizen-2");
  assert.equal(Object.hasOwn(loggedIn.data, "accessToken"), false);
  assert.equal(services.getCurrentSession().mode, "render");
  assert.equal(localStorage.getItem("mi-calle-session"), "new-render-token");
  assert.equal(localStorage.getItem("mi-calle-refresh-token"), "new-refresh-token");
  const registered = await services.register({
    username: "Nueva ciudadana",
    email: "new@example.com",
    password: "pass",
  });
  assert.equal(registered.data.message, "Verifica tu correo.");
  await services.logout();
  assert.equal(services.getCurrentSession(), null);
  assert.equal(localStorage.getItem("mi-calle-refresh-token"), null);
});

test("Render session refresh retries authenticated requests with the new JWT", async () => {
  const calls = [];
  const localStorage = createStorage({
    "mi-calle-session": "expired-token",
    "mi-calle-refresh-token": "old-refresh-token",
    "mi-calle-user": JSON.stringify({ id: "citizen-1", role: "ciudadano" }),
  });
  const services = createServices({
    localStorage,
    sessionStorage: createStorage(),
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/api/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session: { access_token: "fresh-token", refresh_token: "fresh-refresh-token" },
            user: { id: "citizen-1", name: "Ciudadana", role: "ciudadano" },
          }),
        };
      }
      if (url.endsWith("/reportes?mine=true") && calls.filter((call) => call.url.endsWith("/reportes?mine=true")).length === 1) {
        return { ok: false, status: 401, json: async () => ({ error: "JWT expirado" }) };
      }
      if (url.endsWith("/reportes?mine=true")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      throw new Error(`Unexpected request ${url}`);
    },
  });

  assert.deepEqual(await services.getMyReports(), []);
  const reportRequests = calls.filter((call) => call.url.endsWith("/reportes?mine=true"));
  assert.equal(reportRequests[0].init.headers.get("Authorization"), "Bearer expired-token");
  assert.equal(reportRequests[1].init.headers.get("Authorization"), "Bearer fresh-token");
  assert.equal(localStorage.getItem("mi-calle-refresh-token"), "fresh-refresh-token");
});

test("Render registration keeps the Auth session when email confirmation is disabled", async () => {
  const localStorage = createStorage();
  const services = createServices({
    localStorage,
    sessionStorage: createStorage(),
    fetch: async (url) => {
      assert.ok(url.endsWith("/api/auth/register"));
      return {
        ok: true,
        status: 201,
        json: async () => ({
          message: "Registro completado.",
          session: { access_token: "signup-access", refresh_token: "signup-refresh" },
          user: { id: "citizen-1", name: "Nueva ciudadana", role: "ciudadano" },
        }),
      };
    },
  });

  const result = await services.register({
    username: "Nueva ciudadana",
    email: "new@example.com",
    password: "pass1234",
  });
  assert.equal(result.data.authenticated, true);
  assert.equal(localStorage.getItem("mi-calle-session"), "signup-access");
  assert.equal(localStorage.getItem("mi-calle-refresh-token"), "signup-refresh");
});

test("Render admin operations use authenticated report and role-guarded endpoints", async () => {
  const calls = [];
  const id = "550e8400-e29b-41d4-a716-446655440000";
  let status = "en_revision";
  const services = createServices({
    localStorage: createStorage({
      "mi-calle-session": "admin-token",
      "mi-calle-refresh-token": "admin-refresh-token",
      "mi-calle-user": JSON.stringify({ id: "admin-1", name: "Administradora", role: "administrador" }),
    }),
    sessionStorage: createStorage(),
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/reportes") && init.method !== "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id_reporte: id,
            tipo_problema: "bache",
            descripcion: "Daño",
            estado_atencion: status,
            historial_estados: [{
              id_historial: "history-1",
              estado: "en_revision",
              fecha_cambio: "2026-11-20T12:00:00Z",
              observacion: "Inspección en curso",
            }],
          }],
        };
      }
      if (url.endsWith(`/api/reportes/${id}/historial`)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id_historial: "history-1",
            id_reporte: id,
            estado: "en_revision",
            fecha_cambio: "2026-11-20T12:00:00Z",
            observacion: "Inspección en curso",
          }],
        };
      }
      if (url.endsWith(`/reportes/${id}/historial`)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id_historial: "history-1",
            id_reporte: id,
            estado: "en_revision",
            fecha_cambio: "2026-11-20T12:00:00Z",
          }],
        };
      }
      if (url.endsWith(`/api/admin/reportes/${id}/reportante`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id_usuario: "citizen-1", nombre_completo: "Ciudadana" }),
        };
      }
      if (url.endsWith(`/api/admin/reportes/${id}/estado`)) {
        status = JSON.parse(init.body).estado_atencion;
        return { ok: true, status: 200, json: async () => ({ id_reporte: id, estado_atencion: status }) };
      }
      if (url.endsWith(`/reportes/${id}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id_reporte: id, estado_atencion: status }),
        };
      }
      throw new Error(`Unexpected request ${url}`);
    },
  });

  const [report] = await services.getAdminReports();
  assert.equal(report.reporter.name, "Ciudadana");
  assert.equal(report.history[0].observation, "Inspección en curso");
  assert.equal((await services.getReportHistory(id))[0].observation, "Inspección en curso");
  const protectedReads = calls.filter((call) => (
    call.url.endsWith("/reportes")
    || call.url.endsWith(`/api/reportes/${id}/historial`)
    || call.url.endsWith(`/api/admin/reportes/${id}/reportante`)
  ));
  assert.ok(protectedReads.every((call) => call.init.headers.get("Authorization") === "Bearer admin-token"));
  assert.equal((await services.getAdminStatistics()).length, 5);

  await services.updateReportStatus(id, "en_proceso", "Inspección realizada");
  const updateCall = calls.find((call) => call.url.endsWith(`/api/admin/reportes/${id}/estado`));
  assert.equal(updateCall.init.headers.get("Authorization"), "Bearer admin-token");
  assert.deepEqual(JSON.parse(updateCall.init.body), {
    estado_atencion: "en_proceso",
    observacion: "Inspección realizada",
  });
});
