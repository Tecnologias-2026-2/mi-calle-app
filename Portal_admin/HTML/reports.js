const statusOptions = [...document.querySelectorAll('input[name="report-status"]')];
const statusCards = [...document.querySelectorAll(".status-option")];
const steps = [...document.querySelectorAll(".step-item")];
const feedback = document.querySelector(".update-feedback");
const confirmButton = document.querySelector(".confirm-button");

const statusNames = {
  pendiente: "Pendiente",
  proceso: "En proceso",
  resuelto: "Resuelto",
};

function showSelectedStatus(status) {
  const selectedIndex = statusOptions.findIndex((option) => option.value === status);

  statusCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("is-selected", input.value === status);
  });

  steps.forEach((step, index) => {
    step.classList.toggle("is-complete", index < selectedIndex);
    step.classList.toggle("is-current", index === selectedIndex);
  });
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

  feedback.textContent = `Vista previa: el reporte cambiaría a «${statusNames[selected.value]}». No se guardaron cambios en un servidor.`;
  feedback.hidden = false;
});
