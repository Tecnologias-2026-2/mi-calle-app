const userModel = require('../models/user.model');

// Get all users
const getAllUsers = (req, res) => {
  userModel.getAllUsers((err, users) => {
    if (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Error al obtener usuarios' }));
    }
    res.writeHead(200);
    res.end(JSON.stringify(users));
  });
};

// Get user by ID
const getUserById = (req, res, id) => {
  userModel.getUserById(id, (err, user) => {
    if (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Error al obtener usuario' }));
    }
    if (!user) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
    }
    res.writeHead(200);
    res.end(JSON.stringify(user));
  });
};

// Create user
const createUser = (req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const user = JSON.parse(body);
      userModel.createUser(user, (err, result) => {
        if (err) {
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'Error al crear usuario' }));
        }
        res.writeHead(201);
        res.end(JSON.stringify({ message: 'Usuario creado', id: result.insertId }));
      });
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'JSON inválido' }));
    }
  });
};

// Update user
const updateUser = (req, res, id) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const user = JSON.parse(body);
      userModel.updateUser(id, user, (err, result) => {
        if (err) {
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'Error al actualizar usuario' }));
        }
        if (result.affectedRows === 0) {
          res.writeHead(404);
          return res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
        }
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Usuario actualizado' }));
      });
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'JSON inválido' }));
    }
  });
};

// Delete user
const deleteUser = (req, res, id) => {
  userModel.deleteUser(id, (err, result) => {
    if (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Error al eliminar usuario' }));
    }
    if (result.affectedRows === 0) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
    }
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'Usuario eliminado' }));
  });
};

async function login(req, res, body) {
  const { email, password } = body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return sendJson(res, 400, {
      error: 'Email y contraseña son obligatorios.',
    });
  }

  const { data: user, error } = await supabase
    .from('usuarios')
    .select(
      'id_usuario, nombre_completo, correo_electronico, contrasena, rol, is_verified'
    )
    .eq('correo_electronico', normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!user || !(await verifyPassword(String(password), user.contrasena))) {
    return sendJson(res, 401, {
      error: 'El email o la contraseña no son correctos.',
    });
  }

  if (!user.is_verified) {
    return sendJson(res, 403, {
      error: 'Debes verificar tu correo antes de iniciar sesión.',
    });
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

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
