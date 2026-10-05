const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#main-navigation");
function closeMenu() {
  navigation.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menú");
}
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  navigation.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuToggle.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menuToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
matchMedia("(min-width: 1131px)").addEventListener("change", closeMenu);
navigation
  .querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", closeMenu));
let dialogOpener = null;
document.querySelectorAll("[data-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.dialog);
    const current = document.querySelector("dialog[open]");
    if (!current)
      dialogOpener =
        button.closest("nav") && matchMedia("(max-width: 1130px)").matches
          ? menuToggle
          : button;
    if (current) current.close();
    closeMenu();
    target.showModal();
  });
});
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog
    .querySelector(".dialog-close")
    ?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (!document.querySelector("dialog[open]")) dialogOpener?.focus();
  });
});
