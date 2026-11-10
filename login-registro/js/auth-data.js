export const authMessages = {
  validation: {
    required: "Completa todos los campos para continuar.",
    invalidEmail: "Ingresa un correo electrónico válido.",
    passwordLength: "La contraseña debe tener al menos 8 caracteres.",
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
