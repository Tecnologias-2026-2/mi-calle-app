const crypto = require('crypto');

const KEY_LENGTH = 64;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = String(storedHash).split(':');
    if (!salt || !key) return resolve(false);

    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) return reject(error);
      const expected = Buffer.from(key, 'hex');
      const actual = derivedKey;
      resolve(
        expected.length === actual.length &&
          crypto.timingSafeEqual(expected, actual),
      );
    });
  });
}

module.exports = { hashPassword, verifyPassword };
