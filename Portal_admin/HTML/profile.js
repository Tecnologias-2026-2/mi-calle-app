const personalForm = document.querySelector("#personal-form");
const personalFeedback = document.querySelector("#personal-feedback");
const saveButton = personalForm.querySelector(".profile-save-button");
const fullNameInput = personalForm.elements.name;
const emailInput = personalForm.elements.email;
const phoneInput = personalForm.elements.phone;

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toLocaleUpperCase("es")).join("") || "AD";
}

function renderProfile(user) {
  const name = String(user.name || "").trim();
  const email = String(user.email || "").trim();
  const phone = String(user.phone || "").trim();
  const displayName = name || "Administrador";
  const initials = getInitials(name);

  fullNameInput.value = name;
  emailInput.value = email;
  phoneInput.value = phone;
  document.querySelector(".identity-body h2").textContent = displayName;
  document.querySelector(".identity-email").textContent = email;
  document.querySelector("#profile-phone-display").textContent = phone || "No registrado";
  document.querySelector(".profile-avatar").textContent = initials;
  document.querySelector(".profile-avatar").setAttribute("aria-label", `Iniciales de ${displayName}`);
  document.querySelector(".avatar").textContent = initials;
  document.querySelector(".user-copy strong").textContent = displayName;
}

function showFeedback(message, isError = false) {
  personalFeedback.textContent = message;
  personalFeedback.classList.toggle("is-error", isError);
  personalFeedback.hidden = false;
}

try {
  const session = window.MiCalleServices.getCurrentSession();
  if (session?.user.role === "administrador") {
    renderProfile(session.user);
  }
} catch (error) {
  console.error("No se pudo cargar el perfil administrativo.", error);
  showFeedback(error.message || "No se pudo cargar el perfil.", true);
}

personalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!personalForm.reportValidity()) return;

  const originalButtonContent = saveButton.innerHTML;
  saveButton.disabled = true;
  saveButton.setAttribute("aria-busy", "true");
  saveButton.innerHTML = '<span class="loading-spinner loading-spinner--light" aria-hidden="true"></span> Guardando cambios...';
  personalFeedback.hidden = true;

  try {
    const result = await window.MiCalleServices.updateAdminProfile({
      name: fullNameInput.value,
      phone: phoneInput.value,
    });
    renderProfile(result.data);
    showFeedback("Perfil actualizado correctamente.");
  } catch (error) {
    console.error("No se pudo actualizar el perfil administrativo.", error);
    showFeedback(error.message || "No se pudo actualizar el perfil.", true);
  } finally {
    saveButton.innerHTML = originalButtonContent;
    saveButton.disabled = false;
    saveButton.setAttribute("aria-busy", "false");
  }
});

personalForm.addEventListener("input", () => {
  personalFeedback.hidden = true;
});
