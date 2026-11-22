const test = require("node:test");
const assert = require("node:assert/strict");
const createServices = require("../frontend-services");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("password recovery and update use the backend auth endpoints", async () => {
  const calls = [];
  const services = createServices({
    localStorage: createStorage({
      "mi-calle-session": "citizen-access-token",
      "mi-calle-user": JSON.stringify({ id: "citizen-1", role: "ciudadano" }),
    }),
    sessionStorage: createStorage(),
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ message: "Contraseña actualizada." }) };
    },
  });

  await services.resetPasswordForEmail(" persona@example.com ", {
    redirectTo: "https://example.test/mi-calle/login-registro/html/restablecer-contrasena.html",
  });
  await services.completePasswordRecovery({
    accessToken: "recovery-access",
    refreshToken: "recovery-refresh",
    type: "recovery",
    password: "new-password",
  });
  await services.changePassword({
    currentPassword: "old-password",
    newPassword: "new-password",
  });

  assert.equal(calls[0].url, "https://mi-calle-app-backend.onrender.com/api/auth/password-recovery");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    email: "persona@example.com",
    redirectTo: "https://example.test/mi-calle/login-registro/html/restablecer-contrasena.html",
  });
  assert.equal(calls[1].url, "https://mi-calle-app-backend.onrender.com/api/auth/password-recovery/complete");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    accessToken: "recovery-access",
    refreshToken: "recovery-refresh",
    type: "recovery",
    password: "new-password",
  });
  assert.equal(calls[2].url, "https://mi-calle-app-backend.onrender.com/api/auth/password");
  assert.equal(calls[2].init.headers.get("Authorization"), "Bearer citizen-access-token");
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    currentPassword: "old-password",
    newPassword: "new-password",
  });
});
