const crypto = require('crypto');
const supabase = require('../config/supabase');
const { sendVerificationEmail } = require('../services/email.service');
const { hashPassword, verifyPassword } = require('../services/password.service');
const { createSessionToken } = require('../services/session.service');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

async function register(req, res, body) {
  const { nombre_completo: name, email, password } = body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!name || !normalizedEmail || !password) {
    return sendJson(res, 400, { error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return sendJson(res, 400, { error: 'El email no es válido.' });
  }
  if (String(password).length < 8) {
    return sendJson(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const { data: existingUser, error: lookupError } = await supabase
    .from('usuarios')
    .select('id_usuario, is_verified')
    .eq('correo_electronico', normalizedEmail)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existingUser?.is_verified) {
    return sendJson(res, 409, { error: 'Ya existe una cuenta verificada con ese email.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(String(password));
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const userData = {
    nombre_completo: String(name).trim(),
    correo_electronico: normalizedEmail,
    contrasena: passwordHash,
    rol: 'Ciudadano',
    is_verified: false,
    verification_token: token,
    verification_expires_at: expiresAt,
  };

  const query = existingUser
    ? supabase.from('usuarios').update(userData).eq('id_usuario', existingUser.id_usuario)
    : supabase.from('usuarios').insert(userData);
  const { error: saveError } = await query;
  if (saveError) throw saveError;

  try {
    await sendVerificationEmail({ email: normalizedEmail, name, token });
  } catch (emailError) {
    await supabase
      .from('usuarios')
      .delete()
      .eq('correo_electronico', normalizedEmail)
      .eq('is_verified', false);
    throw emailError;
  }

  return sendJson(res, 201, {
    message: 'Registro creado. Revisa tu correo para verificar la cuenta.',
  });
}

async function verify(req, res, token) {
  if (!token) return sendJson(res, 400, { error: 'El token de verificación es obligatorio.' });

  const { data: user, error: lookupError } = await supabase
    .from('usuarios')
    .select('id_usuario, verification_expires_at')
    .eq('verification_token', token)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!user) return sendJson(res, 400, { error: 'El token es inválido o ya fue utilizado.' });
  if (!user.verification_expires_at || new Date(user.verification_expires_at) <= new Date()) {
    return sendJson(res, 410, { error: 'El token de verificación ha expirado.' });
  }

  async function login(req, res, body) {
    const { email, password } = body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return sendJson(res, 400, { error: 'Email y contraseña son obligatorios.' });
    }

    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id_usuario, nombre_completo, correo_electronico, contrasena, rol, is_verified')
      .eq('correo_electronico', normalizedEmail)
      .maybeSingle();
    if (error) throw error;
    if (!user || !(await verifyPassword(String(password), user.contrasena))) {
      return sendJson(res, 401, { error: 'El email o la contraseña no son correctos.' });
    }
    if (!user.is_verified) {
      return sendJson(res, 403, { error: 'Debes verificar tu correo antes de iniciar sesión.' });
    }

    const session = createSessionToken({
      sub: user.id_usuario,
      email: user.correo_electronico,
      role: user.rol,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    return sendJson(res, 200, {
      message: 'Inicio de sesión exitoso.',
      session,
      user: {
        id: user.id_usuario,
        name: user.nombre_completo,
        email: user.correo_electronico,
        role: user.rol,
      },
    });
  }

  const { error: updateError } = await supabase
    .from('usuarios')
    .update({
      is_verified: true,
      verification_token: null,
      verification_expires_at: null,
    })
    .eq('id_usuario', user.id_usuario)
    .eq('verification_token', token);
  if (updateError) throw updateError;

  return sendJson(res, 200, { message: 'Correo verificado correctamente. Ya puedes iniciar sesión.' });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

module.exports = { register, verify, login };
