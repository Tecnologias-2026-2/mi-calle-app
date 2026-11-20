const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const createDemoService = require("../demo-service");
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

function makeHarness({ localStorage = createStorage(), sessionStorage = createStorage(), seed, search = "?demo=1" } = {}) {
  const demo = createDemoService({
    localStorage,
    sessionStorage,
    location: { search },
    loadSeed: seed || (async () => ({
      estadisticas: [],
      reportes: [{
        id: "MC-001",
        categoria: "Bache en la vía",
        ubicacion: "Calle 1",
        reportadoPor: "Reportante demo",
        fecha: "2026-11-01",
        latitud: "4.65",
        longitud: "-74.08",
        descripcion: "Reporte inicial",
        estado: "pendiente",
      }],
    })),
    makePhotoPreview: async () => "data:image/jpeg;base64,dGVzdA==",
  });
  const services = createServices({
    demo,
    localStorage,
    sessionStorage,
    location: { search: "" },
    fetch: async () => { throw new Error("No se esperaba una llamada HTTP."); },
  });
  return { demo, services, localStorage, sessionStorage };
}

test("demo provider exposes the common service interface", async () => {
  const { services, demo } = makeHarness();
  await demo.initialize();

  assert.equal(services.provider, "demo");
  for (const name of [
    "login", "register", "logout", "getCurrentSession", "getPublicReports",
    "getMyReports", "getReportById", "getReportHistory", "createReport",
    "updateReportStatus", "saveAdminObservation",
  ]) {
    assert.equal(typeof services[name], "function", `${name} is part of the service interface`);
  }
});

test("service responses normalize report and history DTOs without public reporter data", async () => {
  const { services, demo } = makeHarness();
  await demo.initialize();
  const [report] = await services.getPublicReports();

  assert.deepEqual(report, {
    id: "MC-001",
    type: "Bache en la vía",
    description: "Reporte inicial",
    status: "pendiente",
    createdAt: "2026-11-01",
    updatedAt: "2026-11-01",
    location: { latitude: 4.65, longitude: -74.08, address: "Calle 1" },
    photo: { url: null, storagePath: null },
    history: [{
      id: null,
      status: "pendiente",
      changedAt: "2026-11-01",
      observation: "Reporte creado en la demostración.",
    }],
  });
  assert.equal(Object.hasOwn(report, "reporter"), false);
  assert.equal(typeof report.location.latitude, "number");
});

test("citizen and admin use shared persisted reports and normalized updates", async () => {
  const harness = makeHarness();
  const { demo, services } = harness;
  await demo.initialize();
  await services.login({ role: "ciudadano" });
  const created = await services.createReport({
    type: "Hueco",
    description: "Requiere atención",
    location: { latitude: 4.7, longitude: -74.1, address: "Calle 10" },
    photoFile: { size: 12, type: "image/jpeg" },
  });
  assert.equal(created.provider, "demo");
  assert.equal(created.data.report.status, "pendiente");
  assert.ok(created.data.report.photo.url.startsWith("data:image/"));
  assert.equal((await services.getMyReports()).length, 2);

  const adminHarness = makeHarness(harness);
  await adminHarness.demo.initialize();
  await adminHarness.services.login({ role: "administrador" });
  const reports = await adminHarness.services.getAdminReports();
  assert.equal(reports.find((report) => report.id === created.data.reportId).reporter.name, "Ciudadano Demo");
  await adminHarness.services.updateReportStatus(created.data.reportId, "en_revision", "Inspección asignada");
  await adminHarness.services.saveAdminObservation(created.data.reportId, "Seguimiento realizado");

  const reloadedHarness = makeHarness(harness);
  await reloadedHarness.demo.initialize();
  const updated = await reloadedHarness.services.getReportById(created.data.reportId);
  assert.equal(updated.status, "en_revision");
  assert.equal((await reloadedHarness.services.getReportHistory(created.data.reportId)).at(-1).observation, "Seguimiento realizado");
});

test("reset restores the six existing demo seed reports", async () => {
  const seedPath = path.join(__dirname, "..", "Portal_admin", "HTML", "admin-mock-data.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  assert.equal(seed.reportes.length, 6);

  const harness = makeHarness({ seed: async () => seed });
  await harness.demo.initialize();
  await harness.services.login({ role: "ciudadano" });
  await harness.services.createReport({
    type: "Temporal",
    description: "Dato a limpiar",
    location: { latitude: 4.6, longitude: -74.1, address: "Carrera 1" },
    photoFile: { size: 1, type: "image/jpeg" },
  });
  await harness.services.resetDemoData();
  assert.equal((await harness.services.getPublicReports()).length, 6);
});

test("provider errors propagate and admin operations reject a citizen session", async () => {
  const failed = makeHarness({ seed: async () => { throw new Error("seed unavailable"); } });
  await assert.rejects(failed.services.getPublicReports(), /seed unavailable/);

  const harness = makeHarness();
  await harness.demo.initialize();
  await harness.services.login({ role: "ciudadano" });
  await assert.rejects(harness.services.getAdminReports(), /administrador demo/);
  await assert.rejects(harness.services.saveAdminObservation("MC-001", "Nota"), /administrador demo/);
});

test("provider selection never treats the demo session as a Render session", async () => {
  const localStorage = createStorage({
    "mi-calle-session": "legacy-token",
    "mi-calle-user": JSON.stringify({ id: "real-user", nombre_completo: "Usuario real", role: "ciudadano" }),
  });
  const sessionStorage = createStorage();
  const harness = makeHarness({ localStorage, sessionStorage });
  await harness.demo.initialize();
  assert.equal(harness.services.provider, "demo");
  assert.equal(harness.services.getCurrentSession(), null);
  await harness.services.login({ role: "ciudadano" });
  assert.equal(harness.services.getCurrentSession().mode, "demo");
  assert.equal(localStorage.getItem("mi-calle-session"), "legacy-token");

  localStorage.removeItem("mi-calle-demo-enabled");
  const renderServices = createServices({
    demo: harness.demo,
    localStorage,
    sessionStorage,
    location: { search: "" },
    fetch: async () => { throw new Error("No se esperaba una llamada HTTP."); },
  });
  assert.equal(renderServices.provider, "render");
  assert.equal(renderServices.getCurrentSession().mode, "render");
  assert.equal(renderServices.getCurrentSession().user.id, "real-user");
});

test("Render adapter preserves current HTTP paths and maps payloads to normalized DTOs", async () => {
  const calls = [];
  const localStorage = createStorage({
    "mi-calle-session": "render-token",
    "mi-calle-user": JSON.stringify({ id: "citizen-1", nombre_completo: "Ciudadana", role: "ciudadano" }),
  });
  const services = createServices({
    demo: { isEnabled: () => false },
    localStorage,
    sessionStorage: createStorage(),
    location: { search: "" },
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
            session: "new-render-token",
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

  const loggedIn = await services.login({ email: "  demo@example.com ", password: "pass" });
  assert.equal(loggedIn.data.user.id, "citizen-2");
  assert.equal(Object.hasOwn(loggedIn.data, "accessToken"), false);
  assert.equal(services.getCurrentSession().mode, "render");
  assert.equal(localStorage.getItem("mi-calle-session"), "new-render-token");
  const registered = await services.register({
    username: "Nueva ciudadana",
    email: "new@example.com",
    password: "pass",
  });
  assert.equal(registered.data.message, "Verifica tu correo.");
  await services.logout();
  assert.equal(services.getCurrentSession(), null);
});

test("Supabase provider is not selectable before its adapter is implemented", () => {
  const harness = makeHarness();
  const services = createServices({
    demo: harness.demo,
    localStorage: harness.localStorage,
    sessionStorage: harness.sessionStorage,
    location: { search: "?provider=supabase" },
  });
  assert.throws(() => services.provider, /todavía no está implementado/);
});
