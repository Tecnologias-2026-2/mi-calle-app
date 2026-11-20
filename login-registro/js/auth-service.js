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

  try {
    const result = await window.MiCalleServices.register({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
    });
    return {
      ok: result.ok,
      message: result.data.message || authMessages.register.confirmEmail,
    };
  } catch (error) {
    return { ok: false, message: error.message || authMessages.system.requestError };
  }
}

export async function logoutUser() {
  return window.MiCalleServices.logout();
}
