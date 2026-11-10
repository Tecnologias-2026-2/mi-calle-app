require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const cors = require('cors');
const supabase = require('./config/supabase');
const authController = require('./controllers/auth.controller');
const app = express();

app.use(cors({
    origin: 'https://tecnologias-2026-2.github.io/mi-calle-app', 
    credentials: true
}));

app.use(express.json());

const allowedOrigins = (process.env.FRONTEND_ORIGINS ||
  'https://tecnologias-2026-2.github.io/mi-calle-app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// 2. Creación del servidor web
const server = http.createServer(async (req, res) => {
  try {
    await applyCors(req, res);
  } catch (error) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: error.message }));
  }

  // Manejo de la petición OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    try {
      const body = await readJsonBody(req);
      return await authController.register(req, res, body);
    } catch (error) {
      return handleError(res, error, 'Error al registrar el usuario.');
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = await readJsonBody(req);
      return await authController.login(req, res, body);
    } catch (error) {
      return handleError(res, error, 'Error al iniciar sesión.');
    }
  }

  if (req.method === 'GET' && pathname === '/verify') {
    try {
      return await authController.verify(req, res, requestUrl.searchParams.get('token'));
    } catch (error) {
      return handleError(res, error, 'Error al verificar el correo.');
    }
  }

  if (req.method === 'GET' && pathname === '/reportes') {
    try {
      const { data, error } = await supabase.from('reportes').select('*');
      if (error) throw error;
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (error) {
      return handleError(res, error, 'Error interno al obtener los reportes.');
    }
  }

  // Endpoint POST: Crear un nuevo reporte
  else if (req.method === 'POST' && pathname === '/reportes') {
    try {
      const data = await readJsonBody(req);
      const { data: insertedData, error } = await supabase.from('reportes').insert([data]).select();
      if (error) throw error;
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(insertedData));
    } catch (error) {
      return handleError(res, error, 'Error interno al crear el reporte.');
    }
  }

  // Manejo de rutas inexistentes (404)
  else {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  }
});

function applyCors(req, res) {
  return new Promise((resolve, reject) => {
    corsMiddleware(req, res, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('El cuerpo de la petición es demasiado grande.'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function handleError(res, error, message) {
  console.error(message, error);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

// 3. Encender el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de Mi Calle ejecutándose en puerto ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});