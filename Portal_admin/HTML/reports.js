const statusOptions = [...document.querySelectorAll('input[name="report-status"]')];
const statusCards = [...document.querySelectorAll(".status-option")];
const steps = [...document.querySelectorAll(".step-item")];
const feedback = document.querySelector(".update-feedback");
const discardReasonContainer = document.querySelector(".discard-reason");
const discardReason = document.querySelector("#discard-reason");

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
