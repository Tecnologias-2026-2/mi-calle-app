const db = require('../database/connection');

// Get all users
const getAllUsers = (callback) => {
  const query = 'SELECT * FROM users';
  db.query(query, (err, results) => {
    if (err) return callback(err, null);
    callback(null, results);
  });
};

// Get user by ID
const getUserById = (id, callback) => {
  const query = 'SELECT * FROM users WHERE id = ?';
  db.query(query, [id], (err, results) => {
    if (err) return callback(err, null);
    callback(null, results[0]);
  });
};

// Create user
const createUser = (user, callback) => {
  const query = 'INSERT INTO users (nombre, email, telefono, fecha_creacion) VALUES (?, ?, ?, NOW())';
  db.query(query, [user.nombre, user.email, user.telefono], (err, results) => {
    if (err) return callback(err, null);
    callback(null, results);
  });
};

// Update user
const updateUser = (id, user, callback) => {
  const query = 'UPDATE users SET nombre = ?, email = ?, telefono = ? WHERE id = ?';
  db.query(query, [user.nombre, user.email, user.telefono, id], (err, results) => {
    if (err) return callback(err, null);
    callback(null, results);
  });
};

// Delete user
const deleteUser = (id, callback) => {
  const query = 'DELETE FROM users WHERE id = ?';
  db.query(query, [id], (err, results) => {
    if (err) return callback(err, null);
    callback(null, results);
  });
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
