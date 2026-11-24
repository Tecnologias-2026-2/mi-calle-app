require('dotenv').config();
const express = require('express');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const cors = require('cors');
const supabase = require('./config/supabase');
const { createPublicClient, createUserClient } = require('./config/supabase-user');
const reportCategories = require('./problem-categories');
const { validateImage } = require('./services/image-validation.service');
const {
  buildPhotoStoragePath,
  cleanupUploadedPhoto,
  inspectReportCreation,
} = require('./services/photo-cleanup.service');
const authController = require('./controllers/auth.controller');
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
    if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin(origin)) {
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

  if (req.method === 'POST' && pathname === '/api/auth/refresh') {
    try {
      const body = await readJsonBody(req);
      return await authController.refresh(req, res, body);
    } catch (error) {
      return handleError(res, error, 'Error al renovar la sesión.');
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/password-recovery') {
    try {
      const body = await readJsonBody(req);
      return await authController.requestPasswordRecovery(req, res, body);
    } catch (error) {
      return handleError(res, error, 'Error al solicitar la recuperación de contraseña.');
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/password-recovery/complete') {
    try {
      const body = await readJsonBody(req);
      return await authController.completePasswordRecovery(req, res, body);
    } catch (error) {
      return handleError(res, error, 'Error al restablecer la contraseña.');
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/password') {
    try {
      const authenticated = await requireSupabaseUser(req, res);
      if (!authenticated) return;
      const body = await readJsonBody(req);
      return await authController.changePassword(req, res, body, authenticated);
    } catch (error) {
      return handleError(res, error, 'Error al cambiar la contraseña.');
    }
  }

  if (req.method === 'GET' && pathname === '/verify') {
    try {
      return await authController.verify(
        req,
        res,
        requestUrl.searchParams.get('token_hash') || requestUrl.searchParams.get('token'),
        requestUrl.searchParams.get('type') || 'signup',
      );
    } catch (error) {
      return handleError(res, error, 'Error al verificar el correo.');
    }
  }

  if (req.method === 'PUT' && pathname === '/api/users/me') {
    try {
      const authenticated = await requireSupabaseUser(req, res);
      if (!authenticated) return;
      const body = await readJsonBody(req);
      return await authController.updateProfile(req, res, body, authenticated);
    } catch (error) {
      return handleError(res, error, 'Error al actualizar el perfil.');
    }
  }

  if (req.method === 'GET' && pathname === '/reportes') {
    try {
      const mine = requestUrl.searchParams.get('mine') === 'true';
      let client = createPublicClient();
      let result;
      let administrator = null;
      if (mine) {
        const authenticated = await requireSupabaseUser(req, res);
        if (!authenticated) return;
        client = authenticated.client;
        result = await client.rpc('mis_reportes');
      } else if (req.headers.authorization) {
        administrator = await requireAdministrator(req, res);
        if (!administrator) return;
        client = administrator.client;
        Promise.resolve()
          .then(() => supabase.rpc('purgar_reportes_descartados'))
          .then(({ error: purgeError }) => {
            if (purgeError) console.error('No se pudieron purgar los reportes descartados.', purgeError);
          })
          .catch((purgeError) => {
            console.error('No se pudieron purgar los reportes descartados.', purgeError);
          });
        result = await client
          .from('reportes')
          .select('id_reporte, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at');
      } else {
        result = await client
          .from('reportes_publicos')
          .select('id_reporte, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at')
          .neq('estado_atencion', 'descartado');
      }
      const { data, error } = result;
      if (error) throw error;

      const reportes = await enrichReports(client, data || []);
      if ((mine || administrator) && reportes.length) {
        await attachPrivateReportHistory(reportes);
      }
      return sendJson(res, 200, reportes);
    } catch (error) {
      return handleError(res, error, 'Error interno al obtener los reportes.');
    }
  }

  else if (req.method === 'GET' && /^\/api\/reportes\/[^/]+\/historial$/.test(pathname)) {
    try {
      const idReporte = pathname.split('/')[3];
      if (!isUuid(idReporte)) return sendJson(res, 400, { error: 'El identificador del reporte no es válido.' });
      const authenticated = await requireSupabaseUser(req, res);
      if (!authenticated) return;

      if (!await isAdministrator(authenticated)) {
        const { data: ownReports, error: ownReportsError } = await authenticated.client.rpc('mis_reportes');
        if (ownReportsError) throw ownReportsError;
        if (!(ownReports || []).some((report) => (
          String(report.id_reporte).toLowerCase() === idReporte.toLowerCase()
        ))) {
          return sendJson(res, 404, { error: 'Historial privado no disponible para este reporte.' });
        }
      }

      const history = await getPrivateReportHistory([idReporte]);
      return sendJson(res, 200, history);
    } catch (error) {
      return handleError(res, error, 'Error interno al obtener el historial privado del reporte.');
    }
  }

  else if (req.method === 'GET' && /^\/reportes\/[^/]+\/historial$/.test(pathname)) {
    try {
      const idReporte = pathname.split('/')[2];
      if (!isUuid(idReporte)) return sendJson(res, 400, { error: 'El identificador del reporte no es válido.' });

      const client = createPublicClient();
      const { data, error } = await client
        .from('historial_estados_publico')
        .select('id_historial, id_reporte, estado, fecha_cambio')
        .eq('id_reporte', idReporte)
        .order('fecha_cambio', { ascending: true });
      if (error) throw error;
      return sendJson(res, 200, data || []);
    } catch (error) {
      return handleError(res, error, 'Error interno al obtener el historial del reporte.');
    }
  }

  else if (req.method === 'GET' && /^\/reportes\/[^/]+$/.test(pathname)) {
    try {
      const idReporte = pathname.split('/')[2];
      if (!isUuid(idReporte)) return sendJson(res, 400, { error: 'El identificador del reporte no es válido.' });

      let client = createPublicClient();
      let data = null;
      let includePrivateHistory = false;
      if (req.headers.authorization) {
        const authenticated = await requireSupabaseUser(req, res);
        if (!authenticated) return;
        client = authenticated.client;

        if (await isAdministrator(authenticated)) {
          const result = await client
            .from('reportes')
            .select('id_reporte, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at')
            .eq('id_reporte', idReporte)
            .maybeSingle();
          if (result.error) throw result.error;
          data = result.data;
          includePrivateHistory = Boolean(data);
        } else {
          const { data: ownReports, error: ownReportsError } = await client.rpc('mis_reportes');
          if (ownReportsError) throw ownReportsError;
          data = (ownReports || []).find((report) => (
            String(report.id_reporte).toLowerCase() === idReporte.toLowerCase()
          )) || null;
          includePrivateHistory = Boolean(data);

          if (!data) {
            client = createPublicClient();
            const result = await client
              .from('reportes_publicos')
              .select('id_reporte, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at')
              .eq('id_reporte', idReporte)
              .maybeSingle();
            if (result.error) throw result.error;
            data = result.data;
          }
        }
      } else {
        const result = await client
          .from('reportes_publicos')
          .select('id_reporte, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at')
          .eq('id_reporte', idReporte)
          .maybeSingle();
        if (result.error) throw result.error;
        data = result.data;
      }
      if (!data) return sendJson(res, 404, { error: 'Reporte no encontrado.' });

      const [report] = await enrichReports(client, [data]);
      if (includePrivateHistory) await attachPrivateReportHistory([report]);
      return sendJson(res, 200, report);
    } catch (error) {
      return handleError(res, error, 'Error interno al obtener el reporte.');
    }
  }

  else if (req.method === 'PUT' && /^\/api\/admin\/reportes\/[^/]+\/estado$/.test(pathname)) {
    try {
      const idReporte = pathname.split('/')[4];
      if (!isUuid(idReporte)) return sendJson(res, 400, { error: 'El identificador del reporte no es válido.' });
      const authenticated = await requireAdministrator(req, res);
      if (!authenticated) return;

      const body = await readJsonBody(req);
      const estado = String(body?.estado_atencion || body?.estado || '').trim();
      const allowedStates = new Set(['pendiente', 'en_revision', 'en_proceso', 'reparado', 'descartado']);
      if (!allowedStates.has(estado)) {
        return sendJson(res, 400, { error: 'El estado del reporte no es válido.' });
      }
      const observacion = body?.observacion == null ? null : String(body.observacion);
      if (estado === 'descartado' && !observacion?.trim()) {
        return sendJson(res, 400, { error: 'La observación es obligatoria para descartar un reporte.' });
      }
      const { error } = await authenticated.client.rpc('actualizar_estado_reporte', {
        p_id_reporte: idReporte,
        p_estado: estado,
        p_observacion: observacion?.trim() || null,
      });
      if (error) throw error;
      return sendJson(res, 200, { id_reporte: idReporte, estado_atencion: estado });
    } catch (error) {
      return handleError(res, error, 'Error interno al actualizar el estado del reporte.');
    }
  }

  else if (req.method === 'GET' && /^\/api\/admin\/reportes\/[^/]+\/reportante$/.test(pathname)) {
    try {
      const idReporte = pathname.split('/')[4];
      if (!isUuid(idReporte)) return sendJson(res, 400, { error: 'El identificador del reporte no es válido.' });
      const authenticated = await requireAdministrator(req, res);
      if (!authenticated) return;

      const { data, error } = await authenticated.client.rpc('consultar_identidad_reportante', {
        p_id_reporte: idReporte,
      });
      if (error) throw error;
      if (!data?.length) return sendJson(res, 404, { error: 'No se encontró la identidad del reportante.' });
      return sendJson(res, 200, data[0]);
    } catch (error) {
      return handleError(res, error, 'Error interno al consultar la identidad del reportante.');
    }
  }

  // Endpoint POST: Crear un nuevo reporte
  else if (req.method === 'POST' && pathname === '/reportes') {
    let fotografiaPath = null;
    let idReporte = null;
    let uploadCompleted = false;
    let rpcStarted = false;
    try {
      const authenticated = await requireSupabaseUser(req, res);
      if (!authenticated) return;
      const { client: userClient } = authenticated;
      const { fields: data, file } = await readMultipartBody(req);
      const tipoProblema = validateProblemType(data.tipo_problema);
      const descripcion = String(data.descripcion || '').trim();
      const direccionTexto = String(data.direccion_texto || '').trim();
      const latitud = Number(data.latitud);
      const longitud = Number(data.longitud);
      if (!descripcion || !direccionTexto
        || !Number.isFinite(latitud) || !Number.isFinite(longitud)) {
        return sendJson(res, 400, {
          error: 'Tipo, descripción, dirección y ubicación válida son obligatorios.',
        });
      }
      if (!tipoProblema) {
        return sendJson(res, 400, { error: 'El tipo de problema no está contemplado en el modelo.' });
      }
      if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
        return sendJson(res, 400, { error: 'Las coordenadas están fuera de rango.' });
      }

      let image;
      try {
        image = await validateImage(file);
      } catch (validationError) {
        return sendJson(res, 400, { error: validationError.message });
      }

      idReporte = crypto.randomUUID();
      fotografiaPath = buildPhotoStoragePath(crypto.randomUUID(), image.extension);
      const fileBlob = new Blob([file.content], { type: image.mimeType });
      const { error: uploadError } = await userClient.storage
        .from('reportes')
        .upload(fotografiaPath, fileBlob, {
          contentType: image.mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadCompleted = true;

      rpcStarted = true;
      const rpcResult = await userClient.rpc('crear_reporte_completo', {
        p_id_reporte: idReporte,
        p_tipo_problema: tipoProblema,
        p_descripcion: descripcion,
        p_storage_path: fotografiaPath,
        p_latitud: Number(latitud.toFixed(6)),
        p_longitud: Number(longitud.toFixed(6)),
        p_direccion_texto: direccionTexto,
        p_id_ubicacion: null,
      });
      if (rpcResult.error) {
        const outcome = await inspectReportCreation(supabase, idReporte, fotografiaPath);
        if (outcome === 'confirmado') {
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ id_reporte: idReporte }));
        }
        if (outcome === 'sin_asociacion' && isDefinitiveDatabaseError(rpcResult.error)) {
          const cleanup = await cleanupUploadedPhoto(supabase, fotografiaPath, idReporte);
          if (cleanup.status === 'eliminado' || cleanup.status === 'ausente') {
            uploadCompleted = false;
            return handleError(res, rpcResult.error, 'No se pudo crear el reporte.');
          }
          console.error('La reserva de limpieza no autorizo eliminar la fotografia.', {
            idReporte,
            fotografiaPath,
            cleanupStatus: cleanup.status,
          });
          return sendJson(res, 503, {
            error: 'No se confirmó que la fotografía pudiera eliminarse; requiere reconciliación.',
            id_reporte: idReporte,
          });
        }
        if (outcome === 'inconsistente') {
          console.error('La inspección encontró un estado parcial del reporte; se conserva la fotografía.', {
            idReporte,
            fotografiaPath,
            error: rpcResult.error,
          });
          return sendJson(res, 503, {
            error: 'El resultado del reporte es inconsistente y requiere reconciliación.',
            id_reporte: idReporte,
          });
        }
        console.error('Resultado de crear_reporte_completo incierto; se conserva el objeto para reconciliación.', {
          idReporte,
          fotografiaPath,
          error: rpcResult.error,
        });
        return sendJson(res, 503, {
          error: 'No se pudo confirmar el resultado del reporte. El objeto se conserva para reconciliación.',
          id_reporte: idReporte,
        });
      }
      if (rpcResult.data !== idReporte) {
        throw new Error('La RPC no confirmó el UUID de reporte solicitado.');
      }

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ id_reporte: idReporte }));
    } catch (error) {
      if (uploadCompleted && fotografiaPath && idReporte && rpcStarted) {
        try {
          const outcome = await inspectReportCreation(supabase, idReporte, fotografiaPath);
          if (outcome === 'confirmado') {
            return sendJson(res, 201, { id_reporte: idReporte });
          }
          if (outcome === 'sin_asociacion' && isDefinitiveDatabaseError(error)) {
            const cleanup = await cleanupUploadedPhoto(supabase, fotografiaPath, idReporte);
            if (cleanup.status === 'eliminado' || cleanup.status === 'ausente') {
              uploadCompleted = false;
            } else {
              console.error('La reserva de limpieza no autorizo eliminar la fotografia.', {
                idReporte,
                fotografiaPath,
                cleanupStatus: cleanup.status,
              });
              return sendJson(res, 503, {
                error: 'No se confirmó que la fotografía pudiera eliminarse; requiere reconciliación.',
                id_reporte: idReporte,
              });
            }
          } else {
            console.error('Resultado de la RPC incierto; se conserva el objeto para reconciliación.', {
              idReporte,
              fotografiaPath,
              outcome,
            });
            return sendJson(res, 503, {
              error: 'No se pudo confirmar el resultado del reporte. La fotografía se conserva para reconciliación.',
              id_reporte: idReporte,
            });
          }
        } catch (cleanupError) {
          console.error('No se pudo resolver el resultado de la RPC; el objeto requiere reconciliación.', {
            idReporte,
            fotografiaPath,
            error: cleanupError,
          });
          return sendJson(res, 503, {
            error: 'No se pudo resolver el resultado del reporte; la fotografía se conserva para reconciliación.',
            id_reporte: idReporte,
          });
        }
      } else if (uploadCompleted && fotografiaPath && idReporte) {
        try {
          const cleanup = await cleanupUploadedPhoto(supabase, fotografiaPath, idReporte);
          if (cleanup.status !== 'eliminado' && cleanup.status !== 'ausente') {
            console.error('La reserva de limpieza no autorizo eliminar la fotografia.', {
              idReporte,
              fotografiaPath,
              cleanupStatus: cleanup.status,
            });
            return sendJson(res, 503, {
              error: 'La fotografía se conserva porque no se pudo confirmar que estuviera sin asociar.',
              id_reporte: idReporte,
            });
          }
        } catch (cleanupError) {
          console.error('Falló la compensación de Storage; el objeto requiere reconciliación.', {
            idReporte,
            fotografiaPath,
            error: cleanupError,
          });
          return sendJson(res, 503, {
            error: 'Falló la compensación; la fotografía queda pendiente de reconciliación.',
            id_reporte: idReporte,
          });
        }
      }
      if (error.statusCode) {
        return sendJson(res, error.statusCode, { error: error.message });
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

function isLocalDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function enrichReports(client, reports) {
  const reportIds = [...new Set(reports.map((report) => report.id_reporte).filter(Boolean))];
  if (!reportIds.length) return [];

  const locationIds = [...new Set(reports.map((report) => report.id_ubicacion).filter(Boolean))];
  const [locationsResult, photosResult, historyResult] = await Promise.all([
    locationIds.length
      ? client
        .from('ubicaciones')
        .select('id_ubicacion, latitud, longitud, direccion_texto')
        .in('id_ubicacion', locationIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from('fotografias')
      .select('id_reporte, storage_path, fecha_carga')
      .in('id_reporte', reportIds),
    client
      .from('historial_estados_publico')
      .select('id_historial, id_reporte, estado, fecha_cambio')
      .in('id_reporte', reportIds)
      .order('fecha_cambio', { ascending: true }),
  ]);
  if (locationsResult.error) throw locationsResult.error;
  if (photosResult.error) throw photosResult.error;
  if (historyResult.error) throw historyResult.error;

  const locationById = new Map(
    (locationsResult.data || []).map((location) => [location.id_ubicacion, location]),
  );
  const photoByReportId = new Map(
    (photosResult.data || []).map((photo) => [photo.id_reporte, photo]),
  );
  const historyByReportId = groupReportHistory(historyResult.data || []);

  return reports.map((report) => {
    const location = locationById.get(report.id_ubicacion) || null;
    const storedPhoto = photoByReportId.get(report.id_reporte);
    const photo = storedPhoto
      ? {
        url: client.storage.from('reportes').getPublicUrl(storedPhoto.storage_path).data.publicUrl,
        storagePath: storedPhoto.storage_path,
        uploadedAt: storedPhoto.fecha_carga,
      }
      : null;
    return {
      ...report,
      ...(location || {}),
      ubicacion: location,
      photo,
      historial_estados: historyByReportId.get(report.id_reporte) || [],
    };
  });
}

function groupReportHistory(history) {
  const historyByReportId = new Map();
  history.forEach((entry) => {
    const reportHistory = historyByReportId.get(entry.id_reporte) || [];
    reportHistory.push(entry);
    historyByReportId.set(entry.id_reporte, reportHistory);
  });
  return historyByReportId;
}

async function getPrivateReportHistory(reportIds) {
  const ids = [...new Set(reportIds.filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('historial_estados')
    .select('id_historial, id_reporte, estado, fecha_cambio, observacion')
    .in('id_reporte', ids)
    .order('fecha_cambio', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function attachPrivateReportHistory(reports) {
  const history = await getPrivateReportHistory(reports.map((report) => report.id_reporte));
  const historyByReportId = groupReportHistory(history);
  reports.forEach((report) => {
    report.historial_estados = historyByReportId.get(report.id_reporte) || [];
  });
}

async function requireSupabaseUser(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (!token) {
    sendJson(res, 401, { error: 'Se requiere una sesión Supabase válida.' });
    return null;
  }

  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    if (error && !error.status) {
      console.error('No se pudo validar el access token contra Supabase Auth.', error);
      sendJson(res, 503, { error: 'No se pudo validar la sesión con Supabase.' });
      return null;
    }
    sendJson(res, 401, { error: 'La sesión Supabase es inválida o ha expirado.' });
    return null;
  }
  return { client, user: data.user };
}

async function isAdministrator(authenticated) {
  const { data: profile, error } = await authenticated.client
    .from('perfiles')
    .select('rol')
    .eq('id_usuario', authenticated.user.id)
    .maybeSingle();
  if (error) throw error;
  return profile?.rol === 'administrador';
}

async function requireAdministrator(req, res) {
  const authenticated = await requireSupabaseUser(req, res);
  if (!authenticated) return null;

  if (!await isAdministrator(authenticated)) {
    sendJson(res, 403, { error: 'La operación requiere un administrador autenticado.' });
    return null;
  }
  return authenticated;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 1_000_000) {
        tooLarge = true;
        reject(requestError('El cuerpo de la petición es demasiado grande.', 413));
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function readMultipartBody(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    const error = new Error('La petición debe ser multipart/form-data.');
    error.statusCode = 400;
    return Promise.reject(error);
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      totalLength += chunk.length;
      if (totalLength > 6 * 1024 * 1024) {
        rejected = true;
        const error = new Error('La fotografía supera el límite de 5 MB.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const body = Buffer.concat(chunks);
        const delimiter = Buffer.from(`--${boundary}`);
        const fields = Object.create(null);
        let file = null;
        let offset = 0;

        while (offset < body.length) {
          const start = body.indexOf(delimiter, offset);
          if (start === -1) break;
          const partStart = start + delimiter.length;
          if (body.subarray(partStart, partStart + 2).toString() === '--') break;
          const contentStart = partStart + 2;
          const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), contentStart);
          if (headerEnd === -1) throw requestError('El formulario multipart está mal formado.', 400);
          const headers = body.subarray(contentStart, headerEnd).toString('utf8');
          const nextBoundary = body.indexOf(delimiter, headerEnd + 4);
          if (nextBoundary === -1) throw requestError('El formulario multipart está incompleto.', 400);
          const contentEnd = nextBoundary - 2;
          const content = body.subarray(headerEnd + 4, contentEnd);
          const nameMatch = headers.match(/name="([^"]+)"/i);
          if (nameMatch) {
            const filenameMatch = headers.match(/filename="([^"]*)"/i);
            if (filenameMatch && filenameMatch[1]) {
              if (file) throw requestError('Solo se permite una fotografía por reporte.', 400);
              const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
              file = {
                content,
                filename: filenameMatch[1],
                contentType: typeMatch ? typeMatch[1].trim() : '',
              };
            } else {
              if (Object.prototype.hasOwnProperty.call(fields, nameMatch[1])) {
                throw requestError(`El campo ${nameMatch[1]} está repetido.`, 400);
              }
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

function isDefinitiveDatabaseError(error) {
  const code = String(error?.code || '');
  const sqlState = /^[0-9A-Z]{5}$/.test(code);
  const connectionFailure = code.startsWith('08')
    || ['57P01', '57P02', '57P03'].includes(code);
  const status = Number(error?.status);
  const definitiveHttpError = status >= 400 && status < 500
    && status !== 408 && status !== 425;
  return (sqlState && !connectionFailure)
    || definitiveHttpError;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateProblemType(value) {
  const type = typeof value === 'string' ? value : '';
  return reportCategories.includes(type) ? type : '';
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