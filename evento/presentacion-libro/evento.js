'use strict';
(() => {
  const CIP_URL = 'https://cipvirtual.cip.org.pe/siceeventosweb/externo/evento/inscripcionWeb/YMqywgANvYscRkIs0W9SxVae9ll4w2';
  const BOOK_URL = '/publicaciones/#comprar-libro';
  const offer = document.querySelector('#book-after-registration');
  const money = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value));
  const revealBookOffer = () => {
    if (!offer) return;
    offer.hidden = false;
    sessionStorage.setItem('malba-cip-signup-opened', '1');
    const note = document.querySelector('.event-external-note');
    if (note) note.textContent = 'Se abrió el formulario del CIP en otra pestaña. Al terminar, puedes volver aquí para comprar el libro si lo deseas.';
    offer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  document.querySelectorAll('[data-cip-registration]').forEach(link => {
    link.href = CIP_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', revealBookOffer);
  });
  const bookLink = offer?.querySelector('a[href="/publicaciones/#comprar-libro"]');
  if (bookLink) bookLink.href = BOOK_URL;
  if (sessionStorage.getItem('malba-cip-signup-opened') === '1' && offer) offer.hidden = false;

  const formatDate = date => new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric'
  }).format(date);

  fetch('/api/events/config', { cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(config => {
      if (config.date) {
        const date = new Date(config.date);
        const dateEl = document.querySelector('#event-date');
        const timeEl = document.querySelector('#event-time');
        if (dateEl) dateEl.textContent = formatDate(date);
        if (timeEl) timeEl.textContent = new Intl.DateTimeFormat('es-PE', {
          timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true
        }).format(date) + ' · Hora de Perú';
      }
      if (config.location) {
        const location = document.querySelector('#event-location');
        if (location) location.textContent = config.location;
      }
      if (Number(config.price) > 0) document.querySelectorAll('[data-book-price]').forEach(el => el.textContent = money(config.price));
      if (Number(config.regularPrice) > 0) document.querySelectorAll('[data-regular-price]').forEach(el => el.textContent = money(config.regularPrice));
      const launchUntil = config.launchUntil ? new Date(config.launchUntil) : null;
      const launchActive = launchUntil && Date.now() < launchUntil.getTime();
      const note = document.querySelector('[data-price-note]');
      if (note) {
        if (launchActive) {
          const finalDay = new Date(launchUntil.getTime() - 86400000);
          note.textContent = 'Precio de lanzamiento hasta el ' + formatDate(finalDay) + ' · IGV incluido';
        } else {
          note.textContent = 'Precio regular · IGV incluido';
        }
      }
    })
    .catch(() => {
      // The CIP registration and the regular book checkout remain available if the event API is offline.
    });
})();
