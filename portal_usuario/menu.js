const btnMenu = document.querySelector("#btn-menu");
const menu = document.querySelector("#menu-navegacion");

btnMenu.addEventListener("click", () => {
    const abierto = menu.classList.toggle("abierto");

    // Cambia el icono de barras a X y viceversa
    btnMenu.querySelector("i").className = abierto
        ? "fa-solid fa-xmark"
        : "fa-solid fa-bars";

    btnMenu.setAttribute("aria-expanded", abierto);
});