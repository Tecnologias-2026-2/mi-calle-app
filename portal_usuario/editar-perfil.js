const profileForm = document.querySelector("#formulario-editar-perfil");
const profileMessage = document.querySelector("#mensaje-editar-perfil");
const usernameInput = document.querySelector("#nombre-usuario");

function showProfileMessage(message, isError = false) {
    profileMessage.textContent = message;
    profileMessage.setAttribute("data-error", String(isError));
}

function initializeProfileForm() {
    const user = MiCalleAuth.getUser();
    if (!user) return;

    usernameInput.value = user.name || user.nombre_completo || "";
}

profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = document.querySelector(".btn-guardar-perfil");
    const name = usernameInput.value.trim();
    const phone = document.querySelector("#telefono").value.trim();

    if (!name) {
        showProfileMessage("Escribe tu nombre de usuario.", true);
        return;
    }

    submitButton.disabled = true;
    showProfileMessage("Guardando cambios...");

    try {
        const response = await MiCalleAuth.request("/api/users/me", {
            method: "PUT",
            body: JSON.stringify({
                nombre_completo: name,
                telefono: phone,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Error HTTP ${response.status}`);
        }

        MiCalleAuth.saveUser(data.user);
        usernameInput.value = data.user.name;
        showProfileMessage("Cambios guardados correctamente.");
    } catch (error) {
        console.error("No se pudo actualizar el perfil:", error);
        showProfileMessage(error.message || "No se pudieron guardar los cambios.", true);
    } finally {
        submitButton.disabled = false;
    }
});

initializeProfileForm();
