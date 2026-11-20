const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPhotoStoragePath,
  cleanupUploadedPhoto,
  inspectReportCreation,
} = require('../services/photo-cleanup.service');

const storagePath = 'evidencias/123e4567-e89b-12d3-a456-426614174000.jpg';
const reportId = '223e4567-e89b-12d3-a456-426614174000';

function createServiceClient({
  reservation = 'pendiente',
  exists = { data: false, error: { code: 'NoSuchKey', status: 404 } },
  remove = { data: [{ name: storagePath }], error: null },
  inspect = 'sin_asociacion',
  rpcError = null,
  finalizeError = null,
} = {}) {
  const calls = [];
  const client = {
    calls,
    async rpc(name, parameters) {
      calls.push({ type: 'rpc', name, parameters });
      if (rpcError) return { data: null, error: rpcError };
      if (name === 'mi_calle_reservar_limpieza_fotografia') {
        return { data: reservation, error: null };
      }
      if (name === 'mi_calle_inspeccionar_creacion_reporte') {
        return { data: inspect, error: null };
      }
      if (name === 'mi_calle_finalizar_limpieza_fotografia' && finalizeError) {
        return { data: null, error: finalizeError };
      }
      return { data: null, error: null };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'reportes');
        return {
          async remove(paths) {
            calls.push({ type: 'remove', paths });
            return remove;
          },
          async exists(path) {
            calls.push({ type: 'exists', path });
            return exists;
          },
        };
      },
    },
  };
  return client;
}

test('builds a route with only a random UUID and an approved extension', () => {
  assert.equal(
    buildPhotoStoragePath(reportId, 'webp'),
    `evidencias/${reportId}.webp`,
  );
  assert.throws(() => buildPhotoStoragePath(reportId, 'svg'), /ruta de fotografía válida/);
  assert.throws(() => buildPhotoStoragePath('../../reportes', 'jpg'), /ruta de fotografía válida/);
});

test('inspects creation using the service-only RPC contract', async () => {
  const client = createServiceClient({ inspect: 'confirmado' });
  assert.equal(await inspectReportCreation(client, reportId, storagePath), 'confirmado');
  assert.deepEqual(client.calls[0], {
    type: 'rpc',
    name: 'mi_calle_inspeccionar_creacion_reporte',
    parameters: { p_id_reporte: reportId, p_storage_path: storagePath },
  });
});

test('reserves before removal, verifies absence, then finalizes the tombstone', async () => {
  const client = createServiceClient();
  const logger = { info() {}, warn() {} };
  assert.deepEqual(
    await cleanupUploadedPhoto(client, storagePath, reportId, logger),
    { status: 'eliminado' },
  );
  assert.deepEqual(client.calls.map((call) => call.type), [
    'rpc', 'remove', 'exists', 'rpc',
  ]);
  assert.equal(client.calls[0].name, 'mi_calle_reservar_limpieza_fotografia');
  assert.equal(client.calls[2].path, storagePath);
  assert.equal(client.calls[3].name, 'mi_calle_finalizar_limpieza_fotografia');
});

test('never removes an object when the reservation reports an association', async () => {
  const client = createServiceClient({ reservation: 'asociado' });
  const result = await cleanupUploadedPhoto(client, storagePath, reportId);
  assert.deepEqual(result, { status: 'asociado' });
  assert.equal(client.calls.some((call) => call.type === 'remove'), false);
});

test('logs a remove error when absence is independently confirmed', async () => {
  const client = createServiceClient({
    remove: { data: null, error: { code: 'NoSuchKey', status: 404, message: 'missing' } },
  });
  const warnings = [];
  const logger = {
    info() {},
    warn(message, details) {
      warnings.push({ message, details });
    },
  };
  assert.deepEqual(
    await cleanupUploadedPhoto(client, storagePath, reportId, logger),
    { status: 'eliminado' },
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].details.storagePath, storagePath);
  assert.equal(
    client.calls.some((call) => call.name === 'mi_calle_finalizar_limpieza_fotografia'),
    true,
  );
});

test('keeps the tombstone pending and records an error if Storage still sees the object', async () => {
  const client = createServiceClient({
    exists: { data: true, error: null },
  });
  await assert.rejects(
    cleanupUploadedPhoto(client, storagePath, reportId, { info() {}, warn() {} }),
    /todavía confirma que el objeto existe/,
  );
  assert.equal(
    client.calls.some((call) => call.name === 'mi_calle_registrar_error_limpieza_fotografia'),
    true,
  );
  assert.equal(
    client.calls.some((call) => call.name === 'mi_calle_finalizar_limpieza_fotografia'),
    false,
  );
});

test('does not continue when Storage cannot confirm object absence', async () => {
  const client = createServiceClient({
    exists: { data: null, error: { code: 'Unauthorized', status: 401 } },
  });
  await assert.rejects(cleanupUploadedPhoto(client, storagePath, reportId));
  assert.equal(
    client.calls.some((call) => call.name === 'mi_calle_finalizar_limpieza_fotografia'),
    false,
  );
});

test('records finalization failures so the pending tombstone can be retried', async () => {
  const client = createServiceClient({
    finalizeError: { code: '40001', message: 'serialization failure' },
  });
  await assert.rejects(cleanupUploadedPhoto(client, storagePath, reportId));
  assert.equal(
    client.calls.some((call) => call.name === 'mi_calle_registrar_error_limpieza_fotografia'),
    true,
  );
});
