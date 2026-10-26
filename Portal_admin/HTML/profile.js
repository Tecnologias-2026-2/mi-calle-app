const personalForm = document.querySelector("#personal-form");
const passwordForm = document.querySelector("#password-form");
const personalFeedback = document.querySelector("#personal-feedback");
const passwordFeedback = document.querySelector("#password-feedback");

personalForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!personalForm.reportValidity()) {
    return;
  }

  const formData = new FormData(personalForm);
  const fullName = formData.get("name").trim();
  const email = formData.get("email").trim();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((namePart) => namePart[0].toLocaleUpperCase("es"));

  document.querySelector(".identity-body h2").textContent = fullName;
  document.querySelector(".identity-email").textContent = email;
  document.querySelector(".profile-avatar").textContent = initials.join("");
  document.querySelector(".profile-avatar").setAttribute("aria-label", `Iniciales de ${fullName}`);
  document.querySelector(".user-copy strong").textContent = fullName;
  personalFeedback.textContent = "Vista previa actualizada en esta página. Los cambios no se guardaron en un servidor.";
  personalFeedback.hidden = false;
});

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!passwordForm.reportValidity()) {
    return;
  }

  const newPassword = passwordForm.elements.newPassword.value;
  const confirmPassword = passwordForm.elements.confirmPassword.value;

  if (newPassword !== confirmPassword) {
    passwordFeedback.textContent = "La nueva contraseña y su confirmación no coinciden.";
    passwordFeedback.hidden = false;
    passwordForm.elements.confirmPassword.focus();
    return;
  }

  passwordFeedback.textContent = "La contraseña cumple con el formato. No se cambió, porque esta pantalla no está conectada a un servidor.";
  passwordFeedback.hidden = false;
});

personalForm.addEventListener("input", () => {
  personalFeedback.hidden = true;
});

passwordForm.addEventListener("input", () => {
  passwordFeedback.hidden = true;
});
