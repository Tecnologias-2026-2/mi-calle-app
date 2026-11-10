const btnMenu = document.querySelector("#btn-menu");
const menu = document.querySelector("#menu-navegacion");

if (btnMenu && menu) {
    btnMenu.addEventListener("click", () => {
        const abierto = menu.classList.toggle("abierto");
        btnMenu.querySelector("i").className = abierto
            ? "fa-solid fa-xmark"
            : "fa-solid fa-bars";
        btnMenu.setAttribute("aria-expanded", abierto);
    });
}
