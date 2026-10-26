'use strict';
(() => {
  // This shared widget is injected from app.js on public pages.
  // The home page may also load it directly; initialize only once.
  if (window.__malbaAssistantInitialized || document.querySelector('[data-malba-assistant]')) return;
  window.__malbaAssistantInitialized = true;

  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const asset = '/assets/assistant-malba-energy.webp?v=2';
  const root = make('div', 'malba-assistant');
  root.dataset.malbaAssistant = '';
  const panel = make('section', 'malba-assistant-panel');
  panel.id = 'malba-assistant-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Asistente MALBA');

  const header = make('div', 'malba-assistant-head');
  const avatar = make('img', 'malba-assistant-avatar');
  avatar.src = asset;
  avatar.alt = '';
  avatar.width = 42;
  avatar.height = 42;
  const heading = make('div', 'malba-assistant-headline');
  heading.append(make('strong', '', 'Asistente MALBA'), make('span', '', 'Encuentra lo que necesitas'));
  const close = make('button', 'malba-assistant-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar asistente');
  header.append(avatar, heading, close);

  const introduction = make('p', 'malba-assistant-intro', '¡Hola! ¿En qué podemos ayudarte hoy?');
  const label = make('p', 'malba-assistant-label', 'Preguntas frecuentes');
  const quickLinks = make('nav', 'malba-assistant-quicklinks');
  quickLinks.setAttribute('aria-label', 'Accesos rápidos de MALBA');
  for (const [text, url] of [
    ['¿Qué cursos disponibles hay?', '/academia/'],
    ['¿Qué soluciones digitales ofrecen?', '/soluciones-digitales/'],
    ['¿Dónde veo sus publicaciones?', '/publicaciones/'],
    ['¿Cómo solicito una consultoría?', '/consultoria/']
  ]) {
    const link = make('a', 'malba-assistant-question');
    link.href = url;
    link.append(make('span', '', text), make('span', 'malba-assistant-chevron', '›'));
    link.lastElementChild.setAttribute('aria-hidden', 'true');
    quickLinks.append(link);
  }

  const contact = make('a', 'malba-assistant-link', 'Hablar por WhatsApp');
  contact.hidden = true; // Show only after reading a valid CMS WhatsApp configuration.
  contact.target = '_blank';
  contact.rel = 'noopener noreferrer';
  contact.setAttribute('aria-label', 'Hablar con MALBA por WhatsApp (abre en otra pestaña)');
  const icon = make('span', 'malba-assistant-wa-icon', '↗');
  icon.setAttribute('aria-hidden', 'true');
  contact.append(icon);
  panel.append(header, introduction, label, quickLinks, contact);

  const launcher = make('div', 'malba-assistant-launcher');
  const bubble = make('button', 'malba-assistant-bubble', '¿Cómo puedo ayudarte?');
  bubble.type = 'button';
  bubble.setAttribute('aria-controls', panel.id);
  bubble.setAttribute('aria-expanded', 'false');
  const trigger = make('button', 'malba-assistant-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Abrir asistente MALBA');
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');
  const robot = make('img', 'malba-assistant-robot');
  robot.src = asset;
  robot.alt = '';
  robot.width = 104;
  robot.height = 104;
  robot.decoding = 'async';
  trigger.append(robot);
  launcher.append(bubble, trigger);
  root.append(panel, launcher);
  document.body.append(root);

  const toggle = (open, restoreFocus = false) => {
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    bubble.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'Cerrar asistente MALBA' : 'Abrir asistente MALBA');
    if (open) close.focus();
    else if (restoreFocus) trigger.focus();
  };
  trigger.addEventListener('click', () => toggle(panel.hidden));
  bubble.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false, true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) toggle(false, true);
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !root.contains(event.target)) toggle(false);
  });

  // FAQs always work, even if WhatsApp is disabled or settings are temporarily unavailable.
  fetch('/api/public-settings', { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' })
    .then(async response => {
      if (!response.ok || !String(response.headers.get('content-type') || '').includes('application/json')) return null;
      return response.json();
    })
    .then(settings => {
      if (!settings || settings.whatsappEnabled !== true) return;
      const number = String(settings.whatsappNumber || '').replace(/\D/g, '');
      if (!/^\d{9,15}$/.test(number) || /^(\d)\1+$/.test(number)) return;
      contact.href = 'https://wa.me/' + number + '?text=' + encodeURIComponent(String(settings.whatsappMessage || 'Hola, deseo información sobre MALBA PMC.'));
      contact.hidden = false;
    })
    .catch(() => {});
})();