// Datos iniciales y textos compartidos por los flujos de autenticación.
export const initialAuthData = {
  users: [
    {
      id: "user-demo",
      username: "Maria",
      email: "maria@micalle.app",
      password: "MiCalle123",
      verified: true,
    },
  ],
  verification: {
    code: "123456",
    expiresInMinutes: 10,
  },
};

export const authMessages = {
  validation: {
    required: "Completa todos los campos para continuar.",
    invalidEmail: "Ingresa un correo electrónico válido.",
    passwordLength: "La contraseña debe tener al menos 8 caracteres.",
    passwordMismatch: "Las contraseñas no coinciden.",
    invalidCode: "El código debe tener 6 dígitos.",
  },
  login: {
    success: "Inicio de sesión exitoso. Redirigiendo...",
    invalidCredentials: "El correo o la contraseña no son correctos.",
    unverified: "Tu cuenta aún no está verificada. Confirma el código enviado.",
  },
  register: {
    success: "Registro creado. Revisa el código de verificación para continuar.",
    emailExists: "Ya existe una cuenta registrada con ese correo.",
  },
  verification: {
    success: "Cuenta verificada correctamente. Redirigiendo...",
    noPendingUser: "No hay un registro pendiente de verificación.",
    invalidCode: "El código ingresado no es válido.",
    resent: "Código reenviado. Revisa la bandeja de entrada.",
  },
  system: {
    storageError: "No fue posible acceder a los datos locales del navegador.",
  },
};
