const MiCalleAuth = (() => {
    const BASE_URL = "https://mi-calle-app-backend.onrender.com";
    const SESSION_KEY = "mi-calle-session";
    const USER_KEY = "mi-calle-user";
    const LOGIN_URL = "../../login-registro/html/login-usuario.html";

    function readStorage(key) {
        return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    }

    function decodePayload(token) {
        try {
            const payload = token.split(".")[0];
            const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
            return JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
        } catch {
            return null;
        }
    }

    function getToken() {
        const token = readStorage(SESSION_KEY);
        if (!token || typeof token !== "string") return null;

        const payload = decodePayload(token);
        if (!payload || !payload.sub || !payload.exp || Number(payload.exp) <= Date.now()) {
            clearSession();
            return null;
        }
        return token;
    }

    function getUser() {
        try {
            const savedUser = readStorage(USER_KEY);
            if (savedUser) return JSON.parse(savedUser);
        } catch {
            clearSession();
        }

        const token = readStorage(SESSION_KEY);
        const payload = token ? decodePayload(token) : null;
        return payload ? { id: payload.sub, email: payload.email, role: payload.role } : null;
    }

    function clearSession() {
        [SESSION_KEY, USER_KEY].forEach((key) => {
            window.localStorage.removeItem(key);
            window.sessionStorage.removeItem(key);
        });
    }

    function redirectToLogin(message) {
        clearSession();
        const separator = LOGIN_URL.includes("?") ? "&" : "?";
        window.location.replace(`${LOGIN_URL}${separator}session=${encodeURIComponent(message)}`);
    }

    function requireSession() {
        const token = getToken();
        if (!token) {
            redirectToLogin("required");
            return null;
        }
        return { token, user: getUser() };
    }

    async function request(path, options = {}) {
        const token = getToken();
        if (!token) {
            redirectToLogin("expired");
            throw new Error("La sesión ha expirado.");
        }

        const headers = new Headers(options.headers || {});
        headers.set("Authorization", `Bearer ${token}`);
        if (options.body && !(options.body instanceof FormData)) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
        if (response.status === 401 || response.status === 403) {
            redirectToLogin("expired");
            throw new Error("La sesión ha expirado. Inicia sesión nuevamente.");
        }
        return response;
    }

    function initials(user) {
        return (user?.name || user?.nombre_completo || user?.email || "Usuario")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join("");
    }

    function renderUser(user = getUser()) {
        if (!user) return;
        const name = user.name || user.nombre_completo || "Usuario";
        const email = user.email || user.correo_electronico || "";
        const shortName = name.split(/\s+/)[0];
        document.querySelectorAll(".titulo-bienvenida").forEach((element) => {
            element.textContent = `¡Hola, ${shortName}!`;
        });
        document.querySelectorAll(".avatar-usuario").forEach((element) => {
            element.textContent = initials(user);
            element.setAttribute("aria-label", `Perfil de ${name}`);
        });
        document.querySelectorAll(".tarjeta-perfil h3, .tarjeta-perfil-edicion h3").forEach((element) => {
            element.textContent = shortName;
        });
        document.querySelectorAll(".tarjeta-perfil .perfil-datos p:first-child, .tarjeta-perfil-edicion .perfil-datos p:first-child").forEach((element) => {
            element.innerHTML = `<i class="fa-regular fa-envelope"></i> ${email}`;
        });
        document.querySelectorAll(".perfil-datos p[data-user-email]").forEach((element) => {
            element.textContent = email;
        });
        document.querySelectorAll("[data-user-verification]").forEach((element) => {
            const verified = user.is_verified !== false && user.isVerified !== false;
            element.innerHTML = `<i class="fa-solid ${verified ? "fa-circle-check" : "fa-circle-exclamation"}"></i> ${verified ? "Cuenta verificada" : "Cuenta pendiente de verificación"}`;
        });
        document.querySelectorAll("input[data-user-name]").forEach((input) => { input.value = name; });
        document.querySelectorAll("input[data-user-email]").forEach((input) => { input.value = email; });
    }

    function setupLogout() {
        document.querySelectorAll("a[href*='bienvenida.html'], [data-logout]").forEach((element) => {
            if (!element.closest(".logo")) {
                element.addEventListener("click", (event) => {
                    event.preventDefault();
                    clearSession();
                    window.location.replace(LOGIN_URL);
                });
            }
        });
    }

    const session = requireSession();
    if (session) {
        renderUser(session.user);
        setupLogout();
    }

    return { BASE_URL, getToken, getUser, clearSession, request, renderUser, redirectToLogin };
})();
