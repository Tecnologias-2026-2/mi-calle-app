const statusOptions = [...document.querySelectorAll('input[name="report-status"]')];
const statusCards = [...document.querySelectorAll(".status-option")];
const steps = [...document.querySelectorAll(".step-item")];
const connectors = [...document.querySelectorAll(".step-connector span")];
const feedback = document.querySelector(".update-feedback");
const reportIdContainer = document.querySelector(".report-id");

function showSelectedStatus(status) {
  const selectedIndex = statusOptions.findIndex((option) => option.value === status);

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
