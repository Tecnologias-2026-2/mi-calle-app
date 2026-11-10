import {
  loginUser,
  registerUser,
} from "./auth-service.js";

const messageClassByType = {
  error: "auth-message--error",
  success: "auth-message--success",
};

function renderMessage(container, message, type = "error") {
  container.textContent = message;
  container.className = `auth-message ${messageClassByType[type]}`;
  container.hidden = !message;
}

function addMessageContainer(form) {
  const message = document.createElement("p");
  message.className = "auth-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;
  form.prepend(message);
  return message;
}

function setFormBusy(form, busy) {
  form.querySelector("button[type='submit']").disabled = busy;
}

function setupPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.parentElement.querySelector("input");
      const showingPassword = input.type === "password";
      input.type = showingPassword ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(showingPassword));
      toggle.setAttribute(
        "aria-label",
        showingPassword ? "Ocultar contraseña" : "Mostrar contraseña",
      );
    });
  });
}

function setupLoginForm() {
  const form = document.querySelector(".login-form:not(.signup-form)");
  if (!form) return;

  const message = addMessageContainer(form);
  const sessionMessage = new URLSearchParams(window.location.search).get("session");
  if (sessionMessage === "expired") {
    renderMessage(message, "Tu sesión expiró. Inicia sesión nuevamente.");
  } else if (sessionMessage === "required") {
    renderMessage(message, "Inicia sesión para acceder al portal ciudadano.");
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormBusy(form, true);

    try {
      const result = await loginUser(Object.fromEntries(new FormData(form)));
      renderMessage(message, result.message, result.ok ? "success" : "error");
      if (result.ok) {
        window.setTimeout(() => {
          window.location.href = "../../portal_usuario/html/index.html";
        }, 700);
      }
    } catch (error) {
      renderMessage(message, error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

function setupRegisterForm() {
  const form = document.querySelector(".signup-form");
  if (!form) return;

  const message = addMessageContainer(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormBusy(form, true);

    try {
      const result = await registerUser(Object.fromEntries(new FormData(form)));
      renderMessage(message, result.message, result.ok ? "success" : "error");
      if (result.ok) {
        window.setTimeout(() => {
          window.location.href = "registro-exitoso.html";
        }, 700);
      }
    } catch (error) {
      renderMessage(message, error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

setupPasswordToggles();
setupLoginForm();
setupRegisterForm();
