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

// Shared contact modal: send a server-side email instead of opening WhatsApp.
const quickContact=document.querySelector('#quick-contact-form');
if(quickContact){
 const send=quickContact.querySelector('[type=submit]'),note=quickContact.querySelector('.quick-contact-note');
 send.disabled=false;send.textContent='Enviar consulta por correo';
 if(note)note.textContent='Recibirás una respuesta a tu correo electrónico.';
 quickContact.addEventListener('submit',async event=>{
  event.preventDefault();if(!quickContact.reportValidity())return;
  const f=new FormData(quickContact),original=send.textContent;
  send.disabled=true;send.textContent='Enviando…';
  try{
   const r=await fetch('/api/public-contact',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({name:f.get('contact_name'),email:f.get('contact_email'),phone:f.get('contact_phone'),message:f.get('contact_message'),website:f.get('website')||'',source:'contacto-web'})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo enviar la consulta.');
   if(note){note.textContent=data.message||'Consulta enviada.';note.setAttribute('role','status');}
   quickContact.reset();
  }catch(error){if(note){note.textContent=error.message;note.setAttribute('role','alert');}}
  finally{send.disabled=false;send.textContent=original;}
 });
}

// Shared public-site assistant (not loaded inside the admin or student LMS).
// Home already has a direct script tag; other public pages load it here.
if (!document.querySelector('script[src*="site-widgets.js"]')) {
  const assistantScript = document.createElement('script');
  assistantScript.src = '/site-widgets.js?v=20261026-energy2';
  assistantScript.defer = true;
  document.head.append(assistantScript);
}
