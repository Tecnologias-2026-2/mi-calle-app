import { authMessages } from "./auth-data.js";
const API_URL = "http://localhost:3000";
const SESSION_KEY = "mi-calle-session";

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function loginUser({ email, password }) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return { ok: false, message: authMessages.validation.required };
  }

  if (!validateEmail(normalizedEmail)) {
    return { ok: false, message: authMessages.validation.invalidEmail };
  }

  let response;
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
  } catch {
    return { ok: false, message: authMessages.system.requestError };
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, message: result.error || authMessages.login.invalidCredentials };
  }

  window.localStorage.setItem(SESSION_KEY, result.session);
  return {
    ok: true,
    message: authMessages.login.success,
    user: result.user,
    session: result.session,
  };
}

export async function registerUser({
  username,
  email,
  password,
  confirmPassword,
}) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUsername = username?.trim();

  if (!normalizedUsername || !normalizedEmail || !password || !confirmPassword) {
    return { ok: false, message: authMessages.validation.required };
  }

  if (!validateEmail(normalizedEmail)) {
    return { ok: false, message: authMessages.validation.invalidEmail };
  }

  if (password.length < 8) {
    return { ok: false, message: authMessages.validation.passwordLength };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: authMessages.validation.passwordMismatch };
  }

  let response;
  try {
    response = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_completo: normalizedUsername,
        email: normalizedEmail,
        password,
      }),
    });
  } catch {
    return { ok: false, message: authMessages.system.requestError };
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      message: result.error || authMessages.system.requestError,
    };
  }

  return {
    ok: true,
    message: result.message || authMessages.register.confirmEmail,
  };
}

export function logoutUser() {
  window.localStorage.removeItem(SESSION_KEY);
}
