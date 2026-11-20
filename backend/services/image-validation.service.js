const sharp = require('sharp');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_IMAGE_DIMENSION = 8_000;
const ALLOWED_FORMATS = {
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg' },
  png: { extension: 'png', mimeType: 'image/png' },
  webp: { extension: 'webp', mimeType: 'image/webp' },
};

function detectImageFormat(buffer) {
  if (buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

async function validateImage(file) {
  if (!file || !Buffer.isBuffer(file.content) || file.content.length === 0) {
    throw new Error('La fotografía está vacía o no es válida.');
  }
  if (file.content.length > MAX_IMAGE_BYTES) {
    throw new Error('La fotografía supera el límite de 5 MB.');
  }

  const format = detectImageFormat(file.content);
  const expected = format && ALLOWED_FORMATS[format];
  if (!expected) {
    throw new Error('La fotografía debe ser JPEG, PNG o WebP válido.');
  }

  const extension = String(file.filename || '').split('.').pop().toLowerCase();
  const declaredMimeType = String(file.contentType || '').split(';')[0].trim().toLowerCase();
  if (extension !== expected.extension || declaredMimeType !== expected.mimeType) {
    throw new Error('La extensión y el tipo declarado no coinciden con el contenido de la fotografía.');
  }

  try {
    const image = sharp(file.content, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
    });
    const metadata = await image.metadata();
    if (metadata.format !== format
      || !metadata.width || !metadata.height
      || metadata.width > MAX_IMAGE_DIMENSION
      || metadata.height > MAX_IMAGE_DIMENSION
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new Error('Las dimensiones o el formato de la fotografía no son válidos.');
    }

    await sharp(file.content, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).rotate().toBuffer();
  } catch (error) {
    if (error.message === 'Las dimensiones o el formato de la fotografía no son válidos.') {
      throw error;
    }
    if (/pixel limit/i.test(error.message)) {
      throw new Error('Las dimensiones o el formato de la fotografía no son válidos.');
    }
    throw new Error('No se pudo decodificar la fotografía o el archivo está dañado.');
  }

  return { extension: expected.extension, mimeType: expected.mimeType };
}

module.exports = { MAX_IMAGE_BYTES, validateImage };
