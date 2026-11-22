const passwordForm = document.querySelector("#formulario-cambiar-contrasena");
const passwordMessage = document.querySelector("#mensaje-cambiar-contrasena");
const passwordSubmit = passwordForm?.querySelector("button[type='submit']");

function showPasswordMessage(message, type = "error") {
  passwordMessage.textContent = message;
  passwordMessage.className = `mensaje-contrasena mensaje-contrasena--${type}`;
  passwordMessage.hidden = false;
}

document.querySelectorAll(".toggle-password").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const input = toggle.parentElement.querySelector("input");
    const icon = toggle.querySelector("i");
    const showingPassword = input.type === "password";
    input.type = showingPassword ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(showingPassword));
    const label = input.labels?.[0]?.textContent?.trim().toLowerCase() || "contraseña";
    toggle.setAttribute(
      "aria-label",
      `${showingPassword ? "Ocultar" : "Mostrar"} ${label}`,
    );
    icon.classList.toggle("fa-eye", !showingPassword);
    icon.classList.toggle("fa-eye-slash", showingPassword);
  });
});

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentPassword = passwordForm.elements.currentPassword.value;
  const newPassword = passwordForm.elements.newPassword.value;
  const confirmPassword = passwordForm.elements.confirmPassword.value;

  if (!currentPassword) {
    showPasswordMessage("Ingresa tu contraseña actual.");
    return;
  }
  if (newPassword.length < 8 || newPassword.length > 64) {
    showPasswordMessage("La nueva contraseña debe tener entre 8 y 64 caracteres.");
    return;
  }
  if (new TextEncoder().encode(newPassword).length > 72) {
    showPasswordMessage("La contraseña no puede superar 72 bytes. Prueba con menos caracteres especiales.");
    return;
  }
  if (newPassword !== confirmPassword) {
    showPasswordMessage("La nueva contraseña y su confirmación no coinciden.");
    return;
  }
  if (newPassword === currentPassword) {
    showPasswordMessage("La nueva contraseña debe ser diferente de la actual.");
    return;
  }

  passwordSubmit.disabled = true;
  passwordSubmit.setAttribute("aria-busy", "true");
  passwordForm.setAttribute("aria-busy", "true");

  try {
    const result = await window.MiCalleServices.changePassword({
      currentPassword,
      newPassword,
    });
    passwordForm.reset();
    document.querySelectorAll(".toggle-password").forEach((toggle) => {
      const label = toggle.parentElement.querySelector("input").labels?.[0]?.textContent?.trim().toLowerCase()
        || "contraseña";
      toggle.setAttribute("aria-pressed", "false");
      toggle.querySelector("i").classList.remove("fa-eye-slash");
      toggle.querySelector("i").classList.add("fa-eye");
      toggle.setAttribute("aria-label", `Mostrar ${label}`);
    });
    showPasswordMessage(result.data.message || "Contraseña actualizada correctamente.", "success");
  } catch (error) {
    const message = error.status === 401
      ? "La sesión expiró o la contraseña actual no es correcta. Verifica los datos e inténtalo de nuevo."
      : error.status === 429
        ? "Se alcanzó el límite de intentos. Espera un momento antes de intentarlo de nuevo."
        : error instanceof TypeError
          ? "No fue posible conectarnos al servicio. Revisa tu conexión e inténtalo de nuevo."
        : error.message || "No se pudo actualizar la contraseña. Inténtalo de nuevo.";
    showPasswordMessage(message);
  } finally {
    passwordSubmit.disabled = false;
    passwordSubmit.removeAttribute("aria-busy");
    passwordForm.removeAttribute("aria-busy");
  }
});
