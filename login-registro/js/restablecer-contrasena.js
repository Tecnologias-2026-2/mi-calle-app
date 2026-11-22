const resetForm = document.querySelector("#password-reset-form");
const resetFormMessage = document.querySelector("#reset-form-message");
const resetStateMessage = document.querySelector("#reset-state-message");
const resetInvalid = document.querySelector("#reset-invalid");
const resetSuccess = document.querySelector("#reset-success");
const resetSubmit = resetForm?.querySelector("button[type='submit']");
let recoverySession = null;

function showFormMessage(message, type = "error") {
  resetFormMessage.textContent = message;
  resetFormMessage.className = `auth-message auth-message--${type}`;
  resetFormMessage.hidden = false;
}

function showInvalidLink(message) {
  resetForm.hidden = true;
  resetStateMessage.textContent = message;
  resetStateMessage.className = "auth-message auth-message--error";
  resetStateMessage.hidden = false;
  resetInvalid.hidden = false;
}

function readRecoverySession() {
  const parameters = new URLSearchParams(window.location.search);
  new URLSearchParams(window.location.hash.replace(/^#/, "")).forEach((value, key) => {
    parameters.set(key, value);
  });

  const error = parameters.get("error_description")
    || parameters.get("error")
    || parameters.get("error_code");
  if (error) {
    return { error: "El enlace de recuperación es inválido o expiró. Solicita uno nuevo." };
  }

  const accessToken = parameters.get("access_token");
  const refreshToken = parameters.get("refresh_token");
  if (parameters.get("type") !== "recovery" || !accessToken || !refreshToken) {
    return { error: "Abre esta página desde el enlace de recuperación que enviamos a tu correo." };
  }

  return { accessToken, refreshToken, type: "recovery" };
}

recoverySession = readRecoverySession();
if (recoverySession.error) {
  showInvalidLink(recoverySession.error);
} else {
  resetStateMessage.hidden = true;
  resetForm.hidden = false;
}

resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = resetForm.elements.password.value;
  const confirmPassword = resetForm.elements.confirmPassword.value;

  if (password.length < 8 || password.length > 64) {
    showFormMessage("La contraseña debe tener entre 8 y 64 caracteres.");
    return;
  }
  if (new TextEncoder().encode(password).length > 72) {
    showFormMessage("La contraseña no puede superar 72 bytes. Prueba con menos caracteres especiales.");
    return;
  }
  if (password !== confirmPassword) {
    showFormMessage("Las contraseñas no coinciden.");
    return;
  }

  resetSubmit.disabled = true;
  resetSubmit.querySelector("span").textContent = "Guardando...";
  resetForm.setAttribute("aria-busy", "true");

  try {
    const result = await window.MiCalleServices.completePasswordRecovery({
      ...recoverySession,
      password,
    });
    recoverySession = null;
    window.history.replaceState(null, document.title, window.location.pathname);
    resetForm.hidden = true;
    resetStateMessage.hidden = true;
    resetSuccess.hidden = false;
    resetSuccess.querySelector("p").textContent = result.data.message
      || "Tu contraseña se actualizó correctamente.";
  } catch (error) {
    if (error.status === 401) {
      recoverySession = null;
      showInvalidLink(error.message || "El enlace de recuperación es inválido o expiró. Solicita uno nuevo.");
    } else {
      showFormMessage(error.message || "No se pudo actualizar la contraseña. Inténtalo de nuevo.");
    }
  } finally {
    if (resetSubmit) {
      resetSubmit.disabled = false;
      resetSubmit.querySelector("span").textContent = "Guardar nueva contraseña";
    }
    resetForm.removeAttribute("aria-busy");
  }
});
