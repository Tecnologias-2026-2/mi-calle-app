import { authMessages, initialAuthData } from "./auth-data.js";

const STORAGE_KEY = "mi-calle-auth-data";
const PENDING_USER_KEY = "mi-calle-pending-user";

const delay = (milliseconds = 250) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function readStorage(key, fallback) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch (error) {
    console.error("No se pudieron leer los datos de autenticación.", error);
    throw new Error(authMessages.system.storageError);
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("No se pudieron guardar los datos de autenticación.", error);
    throw new Error(authMessages.system.storageError);
  }
}

function getAuthData() {
  const fallbackData = JSON.parse(JSON.stringify(initialAuthData));
  return readStorage(STORAGE_KEY, fallbackData);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function loginUser({ email, password }) {
  await delay();

  if (!email || !password) {
    return { ok: false, message: authMessages.validation.required };
  }

  if (!validateEmail(email)) {
    return { ok: false, message: authMessages.validation.invalidEmail };
  }

  const user = getAuthData().users.find(
    (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
  );

  if (!user || user.password !== password) {
    return { ok: false, message: authMessages.login.invalidCredentials };
  }

  if (!user.verified) {
    return { ok: false, message: authMessages.login.unverified };
  }

  return { ok: true, message: authMessages.login.success, user };
}

export async function registerUser({ username, email, password, confirmPassword }) {
  await delay();

  if (!username || !email || !password || !confirmPassword) {
    return { ok: false, message: authMessages.validation.required };
  }

  if (!validateEmail(email)) {
    return { ok: false, message: authMessages.validation.invalidEmail };
  }

  if (password.length < 8) {
    return { ok: false, message: authMessages.validation.passwordLength };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: authMessages.validation.passwordMismatch };
  }

  const authData = getAuthData();
  const emailExists = authData.users.some(
    (user) => user.email.toLowerCase() === email.toLowerCase(),
  );

  if (emailExists) {
    return { ok: false, message: authMessages.register.emailExists };
  }

  const pendingUser = {
    id: `user-${Date.now()}`,
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password,
    verified: false,
  };

  writeStorage(PENDING_USER_KEY, pendingUser);
  return {
    ok: true,
    message: authMessages.register.success,
    verificationCode: authData.verification.code,
  };
}

export async function verifyCode(code) {
  await delay();

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, message: authMessages.validation.invalidCode };
  }

  const pendingUser = readStorage(PENDING_USER_KEY, null);
  if (!pendingUser) {
    return { ok: false, message: authMessages.verification.noPendingUser };
  }

  const authData = getAuthData();
  if (code !== authData.verification.code) {
    return { ok: false, message: authMessages.verification.invalidCode };
  }

  pendingUser.verified = true;
  authData.users.push(pendingUser);
  writeStorage(STORAGE_KEY, authData);
  window.localStorage.removeItem(PENDING_USER_KEY);

  return { ok: true, message: authMessages.verification.success };
}

export async function resendVerificationCode() {
  await delay();
  const pendingUser = readStorage(PENDING_USER_KEY, null);

  if (!pendingUser) {
    return { ok: false, message: authMessages.verification.noPendingUser };
  }

  return {
    ok: true,
    message: authMessages.verification.resent,
    verificationCode: getAuthData().verification.code,
  };
}
