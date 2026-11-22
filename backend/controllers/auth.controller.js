const { createPublicClient, createUserClient } = require('../config/supabase-user');
const supabase = require('../config/supabase');
const { URL } = require('url');

async function register(req, res, body) {
  const name = String(body?.nombre_completo || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = String(body?.telefono || '').trim();
  const password = String(body?.password || '');

  if (!name || !email || !phone || !password) {
    return sendJson(res, 400, { error: 'Nombre, teléfono, email y contraseña son obligatorios.' });
  }
  if (name.length < 3) {
    return sendJson(res, 400, { error: 'El nombre completo debe tener al menos 3 caracteres.' });
  }
  if (name.length > 100) {
    return sendJson(res, 400, { error: 'El nombre completo no puede superar 100 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'El email no es válido.' });
  }
  if (!/^\+?[0-9]{7,15}$/.test(phone)) {
    return sendJson(res, 400, { error: 'El teléfono debe tener de 7 a 15 números y puede iniciar con +.' });
  }
  if (password.length < 8 || password.length > 64 || Buffer.byteLength(password, 'utf8') > 72) {
    return sendJson(res, 400, { error: 'La contraseña debe tener entre 8 y 64 caracteres y no superar 72 bytes.' });
  }

  const { data, error } = await createPublicClient().auth.signUp({
    email,
    password,
    options: { data: { nombre_completo: name, telefono_contacto: phone } },
  });
  if (error) {
    if (Number(error.status) === 429) {
      return sendJson(res, 429, { error: 'Se alcanzó el límite de registros. Inténtalo más tarde.' });
    }
    return sendJson(res, 400, { error: 'Supabase Auth no pudo completar el registro.' });
  }

  if (data.user) {
    const { data: profile, error: profileError } = await supabase
      .from('perfiles')
      .update({ telefono: phone })
      .eq('id_usuario', data.user.id)
      .select('id_usuario')
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return sendJson(res, 409, { error: 'El perfil todavía no está disponible para esta cuenta.' });
    }
  }

  const response = {
    message: data.session
      ? 'Registro completado.'
      : 'Registro enviado. Revisa tu correo para confirmar la cuenta.',
  };
  if (data.session && data.user) {
    const profile = await loadProfile(data.session.access_token, data.user.id);
    if (!profile) {
      return sendJson(res, 409, { error: 'El perfil todavía no está disponible para esta cuenta.' });
    }
    response.session = sessionDto(data.session);
    response.user = userDto(data.user, profile);
  }
  return sendJson(res, 201, response);
}

async function verify(req, res, tokenHash, type = 'signup') {
  const allowedTypes = new Set([
    'signup',
    'email',
    'recovery',
    'invite',
    'magiclink',
    'email_change',
  ]);
  if (!tokenHash || !allowedTypes.has(type)) {
    return sendJson(res, 400, { error: 'El código de verificación o su tipo no son válidos.' });
  }

  const { data, error } = await createPublicClient().auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error) {
    return sendJson(res, 400, { error: 'El código es inválido, expiró o ya fue utilizado.' });
  }

  return sendJson(res, 200, {
    message: 'Verificación completada.',
    session: data.session?.access_token || null,
  });
}

async function login(req, res, body) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) {
    return sendJson(res, 400, { error: 'Email y contraseña son obligatorios.' });
  }

  const { data, error } = await createPublicClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session || !data.user) {
    return sendJson(res, 401, { error: 'El email o la contraseña no son correctos, o la cuenta no está verificada.' });
  }

  const profileClient = createUserClient(data.session.access_token);
  const { data: profile, error: profileError } = await profileClient
    .from('perfiles')
    .select('id_usuario, nombre_completo, telefono, rol')
    .eq('id_usuario', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    return sendJson(res, 409, { error: 'El perfil todavía no está disponible para esta cuenta.' });
  }

  return sendJson(res, 200, {
    message: 'Inicio de sesión exitoso.',
    session: sessionDto(data.session),
    user: userDto(data.user, profile),
  });
}

async function refresh(req, res, body) {
  const refreshToken = String(body?.refresh_token || '');
  if (!refreshToken) {
    return sendJson(res, 400, { error: 'Se requiere el refresh token de Supabase.' });
  }

  const { data, error } = await createPublicClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session || !data.user) {
    return sendJson(res, 401, { error: 'La sesión ya no se puede renovar. Inicia sesión nuevamente.' });
  }

  const profile = await loadProfile(data.session.access_token, data.user.id);
  if (!profile) {
    return sendJson(res, 409, { error: 'El perfil todavía no está disponible para esta cuenta.' });
  }
  return sendJson(res, 200, {
    session: sessionDto(data.session),
    user: userDto(data.user, profile),
  });
}

async function requestPasswordRecovery(req, res, body) {
  const email = String(body?.email || '').trim().toLowerCase();
  const redirectTo = String(body?.redirectTo || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'Ingresa un correo electrónico válido.' });
  }
  if (!isAllowedRecoveryRedirect(redirectTo)) {
    return sendJson(res, 400, { error: 'La página de recuperación no es un destino permitido.' });
  }

  const { error } = await createPublicClient({ flowType: 'implicit' }).auth.resetPasswordForEmail(
    email,
    { redirectTo },
  );
  if (error) {
    if (isRateLimitError(error)) {
      return sendJson(res, 429, { error: 'Se alcanzó el límite de correos de recuperación. Espera un momento antes de intentarlo de nuevo.' });
    }
    if (['user_not_found', 'email_not_found'].includes(String(error.code || '').toLowerCase())) {
      return sendJson(res, 200, {
        message: 'Si existe una cuenta asociada a ese correo, recibirás instrucciones para recuperar tu contraseña.',
      });
    }
    return sendSupabaseError(res, error, 'No se pudo enviar el correo de recuperación.');
  }

  return sendJson(res, 200, {
    message: 'Si existe una cuenta asociada a ese correo, recibirás instrucciones para recuperar tu contraseña.',
  });
}

async function completePasswordRecovery(req, res, body) {
  const accessToken = String(body?.accessToken || '');
  const refreshToken = String(body?.refreshToken || '');
  const type = String(body?.type || '');
  const password = String(body?.password || '');

  if (type !== 'recovery' || !accessToken || !refreshToken) {
    return sendJson(res, 401, { error: 'El enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.' });
  }
  if (!isValidPassword(password)) {
    return sendJson(res, 400, { error: 'La contraseña debe tener entre 8 y 64 caracteres y no superar 72 bytes.' });
  }

  const authClient = createPublicClient({ flowType: 'implicit' });
  const { data: sessionData, error: sessionError } = await authClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError || !sessionData.session || !sessionData.user) {
    return sendJson(res, 401, { error: 'El enlace de recuperación no es válido o ha expirado. Solicita uno nuevo.' });
  }

  const { error } = await authClient.auth.updateUser({ password });
  if (error) return sendSupabaseError(res, error, 'No se pudo actualizar la contraseña.');

  return sendJson(res, 200, { message: 'Tu contraseña se actualizó correctamente.' });
}

async function changePassword(req, res, body, authenticated) {
  const currentPassword = String(body?.currentPassword || '');
  const newPassword = String(body?.newPassword || '');
  const email = String(authenticated?.user?.email || '').trim().toLowerCase();

  if (!currentPassword || !newPassword) {
    return sendJson(res, 400, { error: 'Ingresa tu contraseña actual y la nueva contraseña.' });
  }
  if (!email) {
    return sendJson(res, 400, { error: 'No se encontró el correo de la sesión para verificar tu identidad.' });
  }
  if (!isValidPassword(newPassword)) {
    return sendJson(res, 400, { error: 'La nueva contraseña debe tener entre 8 y 64 caracteres y no superar 72 bytes.' });
  }
  if (currentPassword === newPassword) {
    return sendJson(res, 400, { error: 'La nueva contraseña debe ser diferente de la actual.' });
  }

  const authClient = createPublicClient();
  const { data, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    if (isRateLimitError(signInError)) {
      return sendJson(res, 429, { error: 'Se alcanzó el límite de intentos. Espera un momento antes de intentarlo de nuevo.' });
    }
    return sendJson(res, 401, { error: 'La contraseña actual no es correcta.' });
  }
  if (!data.session || !data.user || data.user.id !== authenticated.user.id) {
    return sendJson(res, 401, { error: 'No se pudo verificar tu contraseña actual.' });
  }

  const { error } = await authClient.auth.updateUser({ password: newPassword });
  if (error) return sendSupabaseError(res, error, 'No se pudo actualizar la contraseña.');

  return sendJson(res, 200, { message: 'Contraseña actualizada correctamente.' });
}

async function updateProfile(req, res, body, authenticated) {
  const name = String(body?.nombre_completo || '').trim();
  const phone = String(body?.telefono || '').trim();

  if (name.length < 3) {
    return sendJson(res, 400, { error: 'El nombre completo debe tener al menos 3 caracteres.' });
  }
  if (name.length > 100) {
    return sendJson(res, 400, { error: 'El nombre completo no puede superar 100 caracteres.' });
  }
  if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
    return sendJson(res, 400, { error: 'El teléfono debe tener de 7 a 15 números y puede iniciar con +.' });
  }

  const { data: profile, error } = await authenticated.client
    .from('perfiles')
    .update({ nombre_completo: name, telefono: phone || null })
    .eq('id_usuario', authenticated.user.id)
    .select('id_usuario, nombre_completo, telefono, rol')
    .maybeSingle();
  if (error) throw error;
  if (!profile) return sendJson(res, 404, { error: 'Perfil no encontrado.' });

  return sendJson(res, 200, {
    message: 'Perfil actualizado correctamente.',
    user: {
      id: profile.id_usuario,
      name: profile.nombre_completo,
      email: authenticated.user.email,
      role: profile.rol,
      telefono: profile.telefono || '',
    },
  });
}

async function loadProfile(accessToken, userId) {
  const { data, error } = await createUserClient(accessToken)
    .from('perfiles')
    .select('id_usuario, nombre_completo, telefono, rol')
    .eq('id_usuario', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function sessionDto(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}

function userDto(user, profile) {
  return {
    id: profile.id_usuario,
    name: profile.nombre_completo,
    email: user.email,
    role: profile.rol,
    telefono: profile.telefono || '',
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function isValidPassword(password) {
  return password.length >= 8
    && password.length <= 64
    && Buffer.byteLength(password, 'utf8') <= 72;
}

function isRateLimitError(error) {
  const details = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return Number(error?.status) === 429
    || /rate.?limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/.test(details);
}

function sendSupabaseError(res, error, fallbackMessage) {
  if (isRateLimitError(error)) {
    return sendJson(res, 429, { error: 'Se alcanzó el límite de intentos. Espera un momento antes de intentarlo de nuevo.' });
  }
  const status = Number(error?.status);
  if (status >= 400 && status < 500) {
    return sendJson(res, status, { error: fallbackMessage });
  }
  return sendJson(res, 502, { error: fallbackMessage });
}

function isAllowedRecoveryRedirect(value) {
  let redirect;
  try {
    redirect = new URL(value);
  } catch {
    return false;
  }

  const allowedOrigins = (process.env.FRONTEND_ORIGINS
    || 'https://tecnologias-2026-2.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isConfiguredOrigin = allowedOrigins.includes(redirect.origin);
  const isLocalOrigin = redirect.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
  return (isConfiguredOrigin || isLocalOrigin)
    && redirect.pathname.endsWith('/login-registro/html/restablecer-contrasena.html')
    && !redirect.search
    && !redirect.hash
    && !redirect.username
    && !redirect.password;
}

module.exports = {
  register,
  verify,
  login,
  refresh,
  requestPasswordRecovery,
  completePasswordRecovery,
  changePassword,
  updateProfile,
};
