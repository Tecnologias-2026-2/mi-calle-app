const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

if (!emailUser || !emailPass) {
  throw new Error('Faltan EMAIL_USER y EMAIL_PASS en las variables de entorno.');
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  logger: true,
  debug: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail({ email, name, token }) {
  const verificationBaseUrl =
    process.env.VERIFICATION_URL || `${process.env.CLIENT_URL}/verify`;
  const verificationUrl = `${verificationBaseUrl}?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from: `"Mi Calle" <${emailUser}>`,
    to: email,
    subject: 'Verifica tu cuenta de Mi Calle',
    text: `Hola ${name}, verifica tu cuenta en este enlace: ${verificationUrl}`,
    html: `
      <p>Hola ${escapeHtml(name)},</p>
      <p>Confirma tu correo para activar tu cuenta de Mi Calle:</p>
      <p><a href="${verificationUrl}">Verificar mi correo</a></p>
      <p>Este enlace expira en 24 horas.</p>
    `,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));
}

module.exports = { sendVerificationEmail };
