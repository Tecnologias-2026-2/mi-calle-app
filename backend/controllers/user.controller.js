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

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
