const topbarMenus = [...document.querySelectorAll(".topbar-menu")];

function closeTopbarMenus(except = null) {
  topbarMenus.forEach((menu) => {
    if (menu !== except) {
      const popover = menu.querySelector(".topbar-popover");
      const trigger = menu.querySelector("button");
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

topbarMenus.forEach((menu) => {
  const trigger = menu.querySelector("button");
  const popover = menu.querySelector(".topbar-popover");

  trigger.addEventListener("click", () => {
    const willOpen = popover.hidden;
    closeTopbarMenus(willOpen ? menu : null);
    popover.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".topbar-menu")) {
    closeTopbarMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarMenus();
  }
});
