const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  MAX_IMAGE_BYTES,
  validateImage,
} = require('../services/image-validation.service');

async function imageFixture(format, filename, contentType) {
  const content = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  }).toFormat(format).toBuffer();
  return { content, filename, contentType };
}

test('accepts decoded JPEG, PNG, and WebP files with matching metadata', async () => {
  for (const [format, filename, contentType] of [
    ['jpeg', 'evidence.jpg', 'image/jpeg'],
    ['png', 'evidence.png', 'image/png'],
    ['webp', 'evidence.webp', 'image/webp'],
  ]) {
    const result = await validateImage(await imageFixture(format, filename, contentType));
    assert.equal(result.mimeType, contentType);
  }
});

test('rejects declared formats and extensions that do not match binary content', async () => {
  const jpeg = await imageFixture('jpeg', 'evidence.png', 'image/png');
  await assert.rejects(validateImage(jpeg), /no coinciden/);
});

test('rejects malformed or unsupported image bytes', async () => {
  await assert.rejects(
    validateImage({
      content: Buffer.from('not an image'),
      filename: 'evidence.jpg',
      contentType: 'image/jpeg',
    }),
    /JPEG, PNG o WebP válido/,
  );
});

test('rejects buffers larger than the configured byte limit', async () => {
  await assert.rejects(
    validateImage({
      content: Buffer.alloc(MAX_IMAGE_BYTES + 1),
      filename: 'evidence.jpg',
      contentType: 'image/jpeg',
    }),
    /supera el límite de 5 MB/,
  );
});

test('rejects images exceeding the pixel limit', async () => {
  const content = await sharp({
    create: {
      width: 5_000,
      height: 5_000,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  }).png().toBuffer();

  await assert.rejects(
    validateImage({ content, filename: 'evidence.png', contentType: 'image/png' }),
    /dimensiones o el formato/,
  );
});

test('rejects images exceeding the dimension limit', async () => {
  const content = await sharp({
    create: {
      width: 8_001,
      height: 1,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  }).png().toBuffer();

  await assert.rejects(
    validateImage({ content, filename: 'evidence.png', contentType: 'image/png' }),
    /dimensiones o el formato/,
  );
});
