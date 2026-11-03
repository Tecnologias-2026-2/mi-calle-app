const userController = require('../controllers/user.controller');

const handleUserRoutes = (req, res, pathname, query) => {
  // GET /api/users - Get all users
  if (req.method === 'GET' && pathname === '/api/users') {
    userController.getAllUsers(req, res);
  }
  // GET /api/users/:id - Get user by id
  else if (req.method === 'GET' && pathname.match(/^\/api\/users\/\d+$/)) {
    const id = pathname.split('/')[3];
    userController.getUserById(req, res, id);
  }
  // POST /api/users - Create user
  else if (req.method === 'POST' && pathname === '/api/users') {
    userController.createUser(req, res);
  }
  // PUT /api/users/:id - Update user
  else if (req.method === 'PUT' && pathname.match(/^\/api\/users\/\d+$/)) {
    const id = pathname.split('/')[3];
    userController.updateUser(req, res, id);
  }
  // DELETE /api/users/:id - Delete user
  else if (req.method === 'DELETE' && pathname.match(/^\/api\/users\/\d+$/)) {
    const id = pathname.split('/')[3];
    userController.deleteUser(req, res, id);
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  }
};

module.exports = handleUserRoutes;
