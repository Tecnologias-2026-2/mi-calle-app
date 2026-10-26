import {
  loginUser,
  registerUser,
  resendVerificationCode,
  verifyCode,
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
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormBusy(form, true);

    try {
      const result = await loginUser(Object.fromEntries(new FormData(form)));
      renderMessage(message, result.message, result.ok ? "success" : "error");
      if (result.ok) {
        window.setTimeout(() => {
          window.location.href = "bienvenida.html";
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
          window.location.href = "verificacion-usuario.html";
        }, 700);
      }
    } catch (error) {
      renderMessage(message, error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

function setupVerificationForm() {
  const form = document.querySelector(".verification-form");
  if (!form) return;

  const message = addMessageContainer(form);
  const codeInputs = [...form.querySelectorAll(".code-input")];
  const resendButton = form.querySelector(".resend-button");
  const resendFeedback = form.querySelector(".resend-feedback");
  let countdownTimer;

  codeInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);
      if (input.value && codeInputs[index + 1]) codeInputs[index + 1].focus();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && codeInputs[index - 1]) {
        codeInputs[index - 1].focus();
      }
    });
  });

  const startResendCountdown = () => {
    window.clearInterval(countdownTimer);
    let remainingSeconds = 60;
    resendButton.disabled = true;
    resendButton.innerHTML = `Reenviar en <span class="resend-countdown">01:00</span>`;
    countdownTimer = window.setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        window.clearInterval(countdownTimer);
        resendButton.disabled = false;
        resendButton.textContent = "Reenviar";
        return;
      }
      const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
      const seconds = String(remainingSeconds % 60).padStart(2, "0");
      resendButton.querySelector(".resend-countdown").textContent = `${minutes}:${seconds}`;
    }, 1000);
  };

  resendButton.addEventListener("click", async () => {
    const result = await resendVerificationCode();
    resendFeedback.textContent = result.message;
    startResendCountdown();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormBusy(form, true);
    try {
      const code = codeInputs.map((input) => input.value).join("");
      const result = await verifyCode(code);
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

  startResendCountdown();
}

setupPasswordToggles();
setupLoginForm();
setupRegisterForm();
setupVerificationForm();
