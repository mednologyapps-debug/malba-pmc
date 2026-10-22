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

// MALBA uses a clean, typography-led interface. Remove decorative arrow glyphs
// from labels and links while keeping every control accessible by its aria-label.
// Navigation controls that need a visible affordance use words instead.
const arrowGlyphs = /[→←↗↘↓↑›‹⌄⌃]/g;
const arrowlessControls = new Map([
  ["Anterior", "Anterior"],
  ["Siguiente", "Siguiente"],
  ["Programa anterior", "Anterior"],
  ["Programa siguiente", "Siguiente"],
  ["Video anterior", "Anterior"],
  ["Video siguiente", "Siguiente"],
  ["Etapa anterior", "Anterior"],
  ["Etapa siguiente", "Siguiente"],
]);
const arrowWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const arrowTextNodes = [];
while (arrowWalker.nextNode()) arrowTextNodes.push(arrowWalker.currentNode);
arrowTextNodes.forEach((node) => {
  const parent = node.parentElement;
  if (!parent || /^(SCRIPT|STYLE|NOSCRIPT)$/i.test(parent.tagName)) return;
  const control = parent.closest("button");
  const label = control?.getAttribute("aria-label") || "";
  const replacement = [...arrowlessControls.entries()].find(([key]) => label.includes(key));
  node.nodeValue = replacement
    ? replacement[1]
    : node.nodeValue.replace(arrowGlyphs, "");
});

// Three-field contact modal, shared by all contact entry points.
const quickContact = document.querySelector('#quick-contact-form');
if (quickContact) {
  quickContact.querySelector('[type="submit"]').disabled = false;
  quickContact.addEventListener('submit', event => {
    event.preventDefault();
    for (const input of quickContact.querySelectorAll('[required]')) {
      if (!input.value.trim()) {
        input.setCustomValidity('Completa este campo.');
        input.addEventListener('input', () => input.setCustomValidity(''), {once: true});
      }
    }
    if (!quickContact.reportValidity()) return;
    const destination = new URL(quickContact.dataset.contactUrl);
    if (destination.protocol !== 'https:' || destination.hostname !== 'wa.me') return;
    const fields = new FormData(quickContact);
    destination.searchParams.set('text', [
      'Hola, MALBA PMC. Quisiera información.',
      'Nombre: ' + fields.get('contact_name').trim(),
      'Correo: ' + fields.get('contact_email').trim(),
      'Consulta: ' + fields.get('contact_message').trim()
    ].join('\n'));
    const popup = window.open(destination.href, '_blank');
    if (popup) popup.opener = null;
    else window.location.assign(destination.href);
  });
}
