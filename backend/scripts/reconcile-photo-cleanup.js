require('dotenv').config();
const supabase = require('../config/supabase');
const { cleanupUploadedPhoto } = require('../services/photo-cleanup.service');

async function main() {
  const { data: claimedCount, error: claimError } = await supabase.rpc(
    'mi_calle_reclamar_fotografias_huerfanas',
    { p_limit: 100 },
  );
  if (claimError) throw claimError;
  if (!Number.isInteger(claimedCount) || claimedCount < 0) {
    throw new Error('La RPC de reconciliación devolvió un conteo inválido.');
  }

  const { data: pending, error: pendingError } = await supabase.rpc(
    'mi_calle_pendientes_limpieza_fotografias',
    { p_limit: 100 },
  );
  if (pendingError) throw pendingError;
  if (!Array.isArray(pending)) {
    throw new Error('La RPC de reconciliación devolvió una lista inválida.');
  }

  let failures = 0;
  for (const item of pending) {
    try {
      const result = await cleanupUploadedPhoto(
        supabase,
        item.storage_path,
        item.id_reporte,
      );
      if (result.status !== 'eliminado' && result.status !== 'ausente') {
        throw new Error(`Limpieza no completada: ${result.status}`);
      }
    } catch (error) {
      failures += 1;
      console.error('Falló la reconciliación de una fotografía; la reserva se conserva.', {
        storagePath: item.storage_path,
        error,
      });
    }
  }

  console.info('Lote de reconciliación terminado.', {
    claimedCount,
    processedCount: pending.length,
    failures,
  });
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('No se pudo ejecutar la reconciliación de fotografías.', error);
  process.exitCode = 1;
});
