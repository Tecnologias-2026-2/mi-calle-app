export const authMessages = {
  validation: {
    required: "Completa todos los campos para continuar.",
    invalidName: "Escribe tu nombre completo con al menos 3 caracteres.",
    invalidEmail: "Ingresa un correo electrónico válido.",
    invalidPhone: "Ingresa un teléfono válido: de 7 a 15 números y, si quieres, un + al inicio.",
    passwordLength: "La contraseña debe tener entre 8 y 64 caracteres.",
    passwordBytes: "La contraseña no puede superar 72 bytes. Prueba con menos caracteres especiales.",
    passwordMismatch: "Las contraseñas no coinciden.",
  },
  login: {
    success: "Inicio de sesión exitoso. Redirigiendo...",
    invalidCredentials: "El correo o la contraseña no son correctos.",
    unverified: "Tu cuenta aún no está verificada. Confirma el correo enviado.",
  },
  register: {
    success: "Registro creado correctamente.",
    emailExists: "Ya existe una cuenta registrada con ese correo.",
    confirmEmail:
      "Cuenta creada. Revisa tu correo y confirma el enlace para activar tu cuenta.",
  },
  system: {
    requestError: "No fue posible completar la solicitud. Inténtalo de nuevo.",
  },
};
