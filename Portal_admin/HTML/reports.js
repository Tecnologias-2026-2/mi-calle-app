const statusOptions = [...document.querySelectorAll('input[name="report-status"]')];
const statusCards = [...document.querySelectorAll(".status-option")];
const steps = [...document.querySelectorAll(".step-item")];
const feedback = document.querySelector(".update-feedback");
const confirmButton = document.querySelector(".confirm-button");
const discardReasonContainer = document.querySelector(".discard-reason");
const discardReason = document.querySelector("#discard-reason");

const statusNames = {
  pendiente: "Pendiente",
  proceso: "En proceso",
  resuelto: "Resuelto",
  descartado: "Descartado",
};

function showSelectedStatus(status) {
  const selectedIndex = statusOptions.findIndex((option) => option.value === status);

  statusCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("is-selected", input.value === status);
  });

  steps.forEach((step, index) => {
    step.classList.toggle("is-complete", selectedIndex >= 0 && index < selectedIndex);
    step.classList.toggle("is-current", selectedIndex >= 0 && index === selectedIndex);
  });

  discardReasonContainer.hidden = status !== "descartado";
  discardReason.required = status === "descartado";
}

statusOptions.forEach((option) => {
  option.addEventListener("change", () => {
    showSelectedStatus(option.value);
    feedback.hidden = true;
  });
});

confirmButton.addEventListener("click", () => {
  const selected = statusOptions.find((option) => option.checked);

  if (!selected) {
    feedback.textContent = "Selecciona un estado antes de continuar.";
    feedback.hidden = false;
    return;
  }

  if (selected.value === "descartado" && !discardReason.value.trim()) {
    feedback.textContent = "Escribe una razón antes de descartar el reporte.";
    feedback.hidden = false;
    discardReason.focus();
    return;
  }

  feedback.textContent = `Vista previa: el reporte cambiaría a «${statusNames[selected.value]}». No se guardaron cambios en un servidor.`;
  feedback.hidden = false;
});
