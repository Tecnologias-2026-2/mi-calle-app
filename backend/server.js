require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const cors = require('cors');
const supabase = require('./config/supabase');
const authController = require('./controllers/auth.controller');
const { verifySessionToken } = require('./services/session.service');
const app = express();

app.use(cors({
    origin: 'https://tecnologias-2026-2.github.io', 
    credentials: true
}));

app.use(express.json());

const allowedOrigins = (process.env.FRONTEND_ORIGINS ||
  'https://tecnologias-2026-2.github.io')
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
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
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

  if (req.method === 'PUT' && pathname === '/api/users/me') {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      return await authController.updateProfile(req, res, body, user);
    } catch (error) {
      return handleError(res, error, 'Error al actualizar el perfil.');
    }
  }

  if (req.method === 'GET' && pathname === '/reportes') {
    try {
      const user = requireAuth(req, res);
      if (!user) return;

      let query = supabase.from('reportes').select('*, ubicaciones(*)');
      if (requestUrl.searchParams.get('mine') === 'true') {
        query = query.eq('id_usuario', user.sub);
      }
      const { data, error } = await query;
      if (error) throw error;

      const reportes = (data || []).map((reporte) => ({
        ...reporte,
        ...(reporte.ubicaciones || {}),
        ubicacion: reporte.ubicaciones || null,
      }));
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(reportes));
    } catch (error) {
      return handleError(res, error, 'Error interno al obtener los reportes.');
    }
  }

  // Endpoint POST: Crear un nuevo reporte
  else if (req.method === 'POST' && pathname === '/reportes') {
    let fotografiaPath = null;
    let fotografiaId = null;
    let ubicacionId = null;
    try {
      const { fields: data, file } = await readMultipartBody(req);
      const user = requireAuth(req, res);
      if (!user) return;

      const tipoProblema = String(data.tipo_problema || '').trim();
      const descripcion = String(data.descripcion || '').trim();
      const direccionTexto = String(data.direccion_texto || '').trim();
      const latitud = Number(data.latitud);
      const longitud = Number(data.longitud);
      if (!file || !['image/jpeg', 'image/png'].includes(file.contentType)
        || file.content.length > 5 * 1024 * 1024) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          error: 'La fotografía es obligatoria y debe ser JPG o PNG.',
        }));
      }
      if (!tipoProblema || !descripcion || !direccionTexto
        || !Number.isFinite(latitud) || !Number.isFinite(longitud)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          error: 'Tipo, descripción, dirección y ubicación válida son obligatorios.',
        }));
      }

      const extension = file.contentType === 'image/png' ? 'png' : 'jpg';
      fotografiaPath = `reportes/${user.sub}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('reportes-fotos')
        .upload(fotografiaPath, file.content, {
          contentType: file.contentType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: fotografia, error: fotografiaError } = await supabase
        .from('fotografias')
        .insert([{ url_imagen: fotografiaPath }])
        .select()
        .single();
      if (fotografiaError) throw fotografiaError;
      fotografiaId = fotografia.id_fotografia;

      const { data: ubicacion, error: ubicacionError } = await supabase
        .from('ubicaciones')
        .insert([{
          latitud: Number(latitud.toFixed(6)),
          longitud: Number(longitud.toFixed(6)),
          direccion_texto: direccionTexto,
        }])
        .select()
        .single();
      if (ubicacionError) throw ubicacionError;
      ubicacionId = ubicacion.id_ubicacion;

      const reporte = {
        tipo_problema: tipoProblema,
        id_ubicacion: ubicacion.id_ubicacion,
        descripcion,
        estado_atencion: String(data.estado_atencion || 'Reportado'),
        id_usuario: user.sub,
        id_fotografia: fotografiaId,
      };
      const { data: insertedData, error } = await supabase
        .from('reportes')
        .insert([reporte])
        .select();
      if (error) {
        throw error;
      }
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify([{
        ...(insertedData?.[0] || {}),
        ...ubicacion,
        ubicacion,
      }]));
    } catch (error) {
      if (ubicacionId) {
        await supabase.from('ubicaciones').delete().eq('id_ubicacion', ubicacionId);
      }
      if (fotografiaId) {
        await supabase.from('fotografias').delete().eq('id_fotografia', fotografiaId);
      }
      if (fotografiaPath) {
        await supabase.storage.from('reportes-fotos').remove([fotografiaPath]);
      }
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

function requireAuth(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const user = verifySessionToken(token);
  if (user) return user;

  res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'La sesión es inválida o ha expirado.' }));
  return null;
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

      function readMultipartBody(req) {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!boundaryMatch) {
          return Promise.reject(new Error('La petición debe ser multipart/form-data.'));
        }
        const boundary = boundaryMatch[1] || boundaryMatch[2];

        return new Promise((resolve, reject) => {
          const chunks = [];
          let totalLength = 0;
          req.on('data', (chunk) => {
            totalLength += chunk.length;
            if (totalLength > 6 * 1024 * 1024) {
              reject(new Error('La fotografía supera el límite de 5 MB.'));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks);
              const delimiter = Buffer.from(`--${boundary}`);
              const fields = {};
              let file = null;
              let offset = 0;

              while (offset < body.length) {
                const start = body.indexOf(delimiter, offset);
                if (start === -1) break;
                const partStart = start + delimiter.length;
                if (body.subarray(partStart, partStart + 2).toString() === '--') break;
                const contentStart = partStart + 2;
                const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), contentStart);
                if (headerEnd === -1) break;
                const headers = body.subarray(contentStart, headerEnd).toString('utf8');
                const nextBoundary = body.indexOf(delimiter, headerEnd + 4);
                if (nextBoundary === -1) break;
                const contentEnd = nextBoundary - 2;
                const content = body.subarray(headerEnd + 4, contentEnd);
                const nameMatch = headers.match(/name="([^"]+)"/i);
                if (nameMatch) {
                  const filenameMatch = headers.match(/filename="([^"]*)"/i);
                  if (filenameMatch && filenameMatch[1]) {
                    const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
                    file = {
                      content,
                      contentType: typeMatch ? typeMatch[1].trim() : '',
                    };
                  } else {
                    fields[nameMatch[1]] = content.toString('utf8');
                  }
                }
                offset = nextBoundary;
              }
              resolve({ fields, file });
            } catch (error) {
              reject(error);
            }
          });
          req.on('error', reject);
        });
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