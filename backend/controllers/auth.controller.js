const { createPublicClient, createUserClient } = require('../config/supabase-user');

async function register(req, res, body) {
  const name = String(body?.nombre_completo || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');

  if (!name || !email || !password) {
    return sendJson(res, 400, { error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (name.length > 100) {
    return sendJson(res, 400, { error: 'El nombre completo no puede superar 100 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'El email no es válido.' });
  }
  if (password.length < 8) {
    return sendJson(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const { data, error } = await createPublicClient().auth.signUp({
    email,
    password,
    options: { data: { nombre_completo: name } },
  });
  if (error) {
    if (Number(error.status) === 429) {
      return sendJson(res, 429, { error: 'Se alcanzó el límite de registros. Inténtalo más tarde.' });
    }
    return sendJson(res, 400, { error: 'Supabase Auth no pudo completar el registro.' });
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

async function updateProfile(req, res, body, authenticated) {
  const name = String(body?.nombre_completo || '').trim();
  const phone = String(body?.telefono || '').trim();

  if (!name) {
    return sendJson(res, 400, { error: 'El nombre completo es obligatorio.' });
  }
  if (name.length > 100) {
    return sendJson(res, 400, { error: 'El nombre completo no puede superar 100 caracteres.' });
  }
  if (phone.length > 20) {
    return sendJson(res, 400, { error: 'El teléfono no puede superar 20 caracteres.' });
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

module.exports = { register, verify, login, refresh, updateProfile };
