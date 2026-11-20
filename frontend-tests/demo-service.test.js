const test = require("node:test");
const assert = require("node:assert/strict");
const createDemoService = require("../demo-service");

function createStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
  };
}

function makeService({ localStorage = createStorage(), sessionStorage = createStorage() } = {}) {
  const service = createDemoService({
    localStorage,
    sessionStorage,
    location: { search: "?demo=1" },
    loadSeed: async () => ({
      estadisticas: [],
      reportes: [
        {
          id: "MC-001",
          categoria: "Bache en la vía",
          ubicacion: "Calle 1",
          reportadoPor: "Ciudadano demo",
          fecha: "2026-11-01",
          latitud: 4.65,
          longitud: -74.08,
          descripcion: "Reporte inicial",
          estado: "pendiente",
          gravedad: "media",
        },
      ],
    }),
    makePhotoPreview: async () => "data:image/jpeg;base64,dGVzdA==",
  });
  return { service, localStorage, sessionStorage };
}

test("demo sessions stay separate from the real session storage key", () => {
  const { service, localStorage, sessionStorage } = makeService();
  service.loginAs("ciudadano");

  assert.equal(service.getSession().mode, "demo");
  assert.equal(service.getSession().role, "ciudadano");
  assert.equal(localStorage.getItem("mi-calle-session"), null);
  assert.notEqual(sessionStorage.getItem("mi-calle-demo-session-v1"), null);
});

test("citizen-created reports are shared, persisted, and returned by the mine query", async () => {
  const harness = makeService();
  const { service } = harness;
  await service.initialize();
  service.loginAs("ciudadano");
  const form = new Map([
    ["tipo", "Hueco en la vía"],
    ["descripcion", "Daño de demostración"],
    ["direccion_texto", "Calle 10"],
    ["latitud", "4.65"],
    ["longitud", "-74.08"],
    ["fotografia", { size: 1200, type: "image/jpeg" }],
  ]);
  const response = await service.request("/reportes", {
    method: "POST",
    body: { get: (name) => form.get(name) },
  });
  const created = await response.json();

  assert.equal(response.status, 201);
  assert.equal(service.getPublicReports().length, 2);
  assert.equal(service.getUserReports().length, 2);
  assert.ok(service.getReportById(created.id_reporte).foto_preview);

  const reloaded = makeService(harness);
  await reloaded.service.initialize();
  assert.equal(reloaded.service.getPublicReports().length, 2);
  assert.equal(reloaded.service.getReportById(created.id_reporte).descripcion, "Daño de demostración");
});

test("administrator status changes save observations and append history", async () => {
  const { service } = makeService();
  await service.initialize();
  service.loginAs("administrador");
  let notifications = 0;
  service.subscribe(() => { notifications += 1; });

  service.updateReport("MC-001", "en_revision", "Revisión asignada");
  const report = service.getReportById("MC-001");

  assert.equal(report.estado_atencion, "en_revision");
  assert.equal(report.historial_estados.at(-1).observacion, "Revisión asignada");
  assert.equal(report.historial_estados.length, 2);
  assert.equal(notifications, 1);
});

test("form data validation rejects missing location and photo", async () => {
  const { service } = makeService();
  await service.initialize();
  service.loginAs("ciudadano");

  await assert.rejects(service.createReport({
    tipo_problema: "Hueco",
    descripcion: "Falta ubicación",
    direccion_texto: "Calle 2",
    latitud: "",
    longitud: "",
    photoPreview: "data:image/jpeg;base64,dGVzdA==",
  }), /ubicación válida/);
  await assert.rejects(service.createReport({
    tipo_problema: "Hueco",
    descripcion: "Falta foto",
    direccion_texto: "Calle 2",
    latitud: 4.6,
    longitud: -74.1,
  }), /fotografía/);
});

test("reset restores the shared seed data", async () => {
  const { service } = makeService();
  await service.initialize();
  service.loginAs("ciudadano");
  await service.createReport({
    tipo_problema: "Grieta",
    descripcion: "Temporal",
    direccion_texto: "Carrera 1",
    latitud: 4.6,
    longitud: -74.1,
    photoPreview: "data:image/jpeg;base64,dGVzdA==",
  });
  assert.equal(service.getPublicReports().length, 2);

  await service.reset();
  assert.equal(service.getPublicReports().length, 1);
  assert.equal(service.getReportById("MC-001").historial_estados.length, 1);
});
