import { authMessages } from "./auth-data.js";

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

  try {
    const result = await window.MiCalleServices.login({ email: normalizedEmail, password });
    return {
      ok: result.ok,
      message: authMessages.login.success,
      user: result.data.user,
      session: result.data,
    };
  } catch (error) {
    return { ok: false, message: error.message || authMessages.system.requestError };
  }
}

export async function registerUser({
  username,
  phone,
  email,
  password,
  confirmPassword,
}) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUsername = username?.trim();
  const normalizedPhone = phone?.trim();

  if (!normalizedUsername || !normalizedPhone || !normalizedEmail || !password || !confirmPassword) {
    return { ok: false, message: authMessages.validation.required };
  }

  if (normalizedUsername.length < 3) {
    return { ok: false, message: authMessages.validation.invalidName };
  }

  if (!validateEmail(normalizedEmail)) {
    return { ok: false, message: authMessages.validation.invalidEmail };
  }

  if (!/^\+?[0-9]{7,15}$/.test(normalizedPhone)) {
    return { ok: false, message: authMessages.validation.invalidPhone };
  }

  if (password.length < 8 || password.length > 64) {
    return { ok: false, message: authMessages.validation.passwordLength };
  }

  if (new TextEncoder().encode(password).length > 72) {
    return { ok: false, message: authMessages.validation.passwordBytes };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: authMessages.validation.passwordMismatch };
  }

  try {
    const result = await window.MiCalleServices.register({
      username: normalizedUsername,
      phone: normalizedPhone,
      email: normalizedEmail,
      password,
    });
    return {
      ok: result.ok,
      message: result.data.message || authMessages.register.confirmEmail,
      user: result.data.user || null,
      authenticated: Boolean(result.data.authenticated),
    };
  } catch (error) {
    return { ok: false, message: error.message || authMessages.system.requestError };
  }
}

export async function logoutUser() {
  return window.MiCalleServices.logout();
}
