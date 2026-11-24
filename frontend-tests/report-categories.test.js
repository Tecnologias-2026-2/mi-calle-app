const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { categories, formatCategory } = require("../portal_usuario/reporte-formatters");
const backendCategories = require("../backend/problem-categories");
const formSource = fs.readFileSync(
  require.resolve("../portal_usuario/html/reportar.html"),
  "utf8",
);

test("report formatter exposes the complete canonical report form catalog", () => {
  const formSelect = formSource.match(/<select id="tipo"[\s\S]*?<\/select>/)[0];
  const formCategories = [...formSelect.matchAll(/<option value="([^"]+)">/g)]
    .map((option) => option[1])
    .filter(Boolean);
  assert.deepEqual(
    categories.map((category) => category.label),
    formCategories,
  );
  assert.deepEqual(backendCategories, formCategories);
});

test("report formatter keeps categories distinct and maps historical labels to their type", () => {
  assert.equal(formatCategory("Semáforo en mal estado"), "Semáforo en mal estado");
  assert.equal(formatCategory("Señalización dañada o inexistente"), "Señalización dañada o inexistente");
  assert.equal(formatCategory("grieta"), "Grieta / Fisura");
  assert.equal(formatCategory("otro"), "Otro");
});
