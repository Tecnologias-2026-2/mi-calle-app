const statusOptions = [...document.querySelectorAll('input[name="report-status"]')];
const statusCards = [...document.querySelectorAll(".status-option")];
const steps = [...document.querySelectorAll(".step-item")];
const connectors = [...document.querySelectorAll(".step-connector span")];
const feedback = document.querySelector(".update-feedback");
const reportIdContainer = document.querySelector(".report-id");
const statusNote = document.querySelector("#status-note");
const statusNoteLabel = document.querySelector(".update-note-label");
const statusNoteRequirement = document.querySelector("#status-note-requirement");

function showSelectedStatus(status) {
  const selectedIndex = statusOptions.findIndex((option) => option.value === status);
  const observationRequired = status === "descartado";

  statusCards.forEach((card) => {
    const input = card.querySelector("input");
    card.dataset.status = input.value;
    card.classList.toggle("is-selected", input.value === status);
  });

  steps.forEach((step, index) => {
    step.classList.toggle("is-complete", selectedIndex >= 0 && index < selectedIndex);
    step.classList.toggle("is-current", selectedIndex >= 0 && index === selectedIndex);
  });

  connectors.forEach((connector, index) => {
    connector.dataset.step = steps[index].dataset.step;
    connector.classList.toggle("is-complete", selectedIndex > index);
  });

  statusNote.required = observationRequired;
  statusNote.setAttribute("aria-required", String(observationRequired));
  statusNoteLabel.classList.toggle("is-required", observationRequired);
  statusNoteRequirement.textContent = observationRequired
    ? "(obligatoria para descartar)"
    : "(opcional)";
  statusNote.placeholder = observationRequired
    ? "Explica por qué se descarta este reporte..."
    : "Agrega información sobre el avance del reporte...";
}

statusOptions.forEach((option) => {
  option.addEventListener("change", () => {
    showSelectedStatus(option.value);
    feedback.hidden = true;
  });
});

reportIdContainer?.addEventListener("click", async (event) => {
  const copyReportIdButton = event.target.closest(".report-id-copy");
  if (!copyReportIdButton) return;
  const reportId = copyReportIdButton.dataset.reportId;
  if (!reportId) return;
  if (!navigator.clipboard?.writeText) {
    showUpdateFeedback("La copia no está disponible en este navegador.", true);
    return;
  }

  copyReportIdButton.disabled = true;
  try {
    await navigator.clipboard.writeText(reportId);
    showUpdateFeedback("Identificador copiado.");
  } catch (error) {
    console.error("No se pudo copiar el identificador del reporte.", error);
    showUpdateFeedback("No se pudo copiar el identificador del reporte.", true);
  } finally {
    copyReportIdButton.disabled = false;
  }
});

statusNote.addEventListener("input", () => {
  statusNote.setCustomValidity("");
  feedback.hidden = true;
});
