const STORAGE_BUCKET = 'reportes';
const STORAGE_PATH_PATTERN = /^evidencias\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const EXTENSIONS = new Set(['jpg', 'png', 'webp']);

function buildPhotoStoragePath(uuid, extension) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
    || !EXTENSIONS.has(extension)) {
    throw new Error('No se puede construir una ruta de fotografía válida.');
  }
  return `evidencias/${uuid.toLowerCase()}.${extension}`;
}

async function inspectReportCreation(serviceClient, reportId, storagePath) {
  assertStoragePath(storagePath);
  const { data, error } = await serviceClient.rpc('mi_calle_inspeccionar_creacion_reporte', {
    p_id_reporte: reportId,
    p_storage_path: storagePath,
  });
  if (error) throw error;
  if (!['confirmado', 'sin_asociacion', 'inconsistente'].includes(data)) {
    throw new Error('La inspección de la RPC devolvió un estado desconocido.');
  }
  return data;
}

async function cleanupUploadedPhoto(serviceClient, storagePath, reportId, logger = console) {
  assertStoragePath(storagePath);
  const { data: reservation, error: reservationError } = await serviceClient.rpc(
    'mi_calle_reservar_limpieza_fotografia',
    { p_storage_path: storagePath, p_id_reporte: reportId || null },
  );
  if (reservationError) throw reservationError;
  if (!['pendiente', 'eliminado', 'ausente', 'asociado', 'inconsistente'].includes(reservation)) {
    throw new Error('La reserva de limpieza devolvió un estado desconocido.');
  }
  if (reservation !== 'pendiente') return { status: reservation };

  const storage = serviceClient.storage.from(STORAGE_BUCKET);
  let removal;
  try {
    removal = await storage.remove([storagePath]);
  } catch (error) {
    removal = { data: null, error };
  }

  let existence;
  try {
    existence = await storage.exists(storagePath);
  } catch (error) {
    await recordCleanupError(serviceClient, storagePath, error);
    throw error;
  }

  if (existence.data === true) {
    const error = removal.error || new Error('Storage todavía confirma que el objeto existe.');
    await recordCleanupError(serviceClient, storagePath, error);
    throw error;
  }
  if (existence.data !== false
    || (existence.error && !isMissingStorageObject(existence.error))) {
    const error = existence.error || new Error('Storage no confirmó la ausencia del objeto.');
    await recordCleanupError(serviceClient, storagePath, error);
    throw error;
  }

  if (removal.error) {
    logger.warn('Storage.remove devolvió error, pero exists confirmó que el objeto ya no está.', {
      storagePath,
      error: removal.error,
    });
  } else {
    const removalCount = Array.isArray(removal.data) ? removal.data.length : 0;
    logger.info('Resultado de Storage.remove comprobado mediante exists.', {
      storagePath,
      removalCount,
      absent: true,
    });
  }

  const { error: finalizeError } = await serviceClient.rpc(
    'mi_calle_finalizar_limpieza_fotografia',
    { p_storage_path: storagePath },
  );
  if (finalizeError) {
    await recordCleanupError(serviceClient, storagePath, finalizeError);
    throw finalizeError;
  }
  return { status: 'eliminado' };
}

async function recordCleanupError(serviceClient, storagePath, error) {
  const message = `${error?.code || error?.status || 'storage'}: ${error?.message || String(error)}`;
  const { error: recordError } = await serviceClient.rpc(
    'mi_calle_registrar_error_limpieza_fotografia',
    { p_storage_path: storagePath, p_error: message },
  );
  if (recordError) {
    throw new AggregateError(
      [error, recordError],
      'Falló la limpieza de Storage y no se pudo registrar el error.',
    );
  }
}

function isMissingStorageObject(error) {
  return error?.code === 'NoSuchKey'
    || (Number(error?.status) === 404 && !error?.code);
}

function assertStoragePath(storagePath) {
  if (typeof storagePath !== 'string' || !STORAGE_PATH_PATTERN.test(storagePath)) {
    throw new Error('La ruta de fotografía no cumple el contrato aprobado.');
  }
}

module.exports = {
  buildPhotoStoragePath,
  cleanupUploadedPhoto,
  inspectReportCreation,
};
