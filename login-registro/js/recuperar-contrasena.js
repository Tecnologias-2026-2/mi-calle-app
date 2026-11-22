const recoveryForm = document.querySelector("#recovery-form");
const recoveryMessage = document.querySelector("#recovery-message");
const recoveryEmail = document.querySelector("#recovery-email");
const recoverySubmit = recoveryForm?.querySelector("button[type='submit']");

function showRecoveryMessage(message, type) {
  recoveryMessage.textContent = message;
  recoveryMessage.className = `auth-message auth-message--${type}`;
  recoveryMessage.hidden = false;
}

recoveryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = recoveryEmail.value.trim();
  if (!email || !recoveryEmail.checkValidity()) {
    recoveryEmail.reportValidity();
    return;
  }

  recoverySubmit.disabled = true;
  recoverySubmit.querySelector("span").textContent = "Enviando...";
  recoveryForm.setAttribute("aria-busy", "true");

  try {
    const redirectTo = new URL("restablecer-contrasena.html", window.location.href).href;
    const result = await window.MiCalleServices.resetPasswordForEmail(email, { redirectTo });
    showRecoveryMessage(
      result.data.message
        || "Si existe una cuenta asociada a ese correo, recibirás instrucciones para recuperar tu contraseña.",
      "success",
    );
  } catch (error) {
    const message = error.status === 429
      ? "Se alcanzó el límite de correos de recuperación. Espera un momento antes de intentarlo de nuevo."
      : error instanceof TypeError
        ? "No fue posible conectarnos al servicio. Revisa tu conexión e inténtalo de nuevo."
        : error.message || "No se pudo enviar el correo de recuperación. Inténtalo de nuevo.";
    showRecoveryMessage(message, "error");
  } finally {
    recoverySubmit.disabled = false;
    recoverySubmit.querySelector("span").textContent = "Enviar";
    recoveryForm.removeAttribute("aria-busy");
  }
});
