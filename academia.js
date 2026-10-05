// Shared navigation works with mouse, touch and keyboard.
const academyToggle = document.querySelector('.academy-menu-toggle');
const academyMenu = document.querySelector('#academy-menu');
const academyGroup = document.querySelector('.nav-academia');
function closeAcademyMenu() {
  academyToggle?.setAttribute('aria-expanded', 'false');
  if (academyMenu) academyMenu.hidden = true;
}
academyToggle?.addEventListener('click', () => {
  const open = academyToggle.getAttribute('aria-expanded') !== 'true';
  academyToggle.setAttribute('aria-expanded', String(open));
  academyMenu.hidden = !open;
});
academyGroup?.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !academyMenu.hidden) {
    event.stopPropagation();
    closeAcademyMenu();
    academyToggle.focus();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.nav-academia')) closeAcademyMenu();
});
academyMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeAcademyMenu));
document.querySelector('.menu-toggle')?.addEventListener('click', closeAcademyMenu);
matchMedia('(min-width: 1131px)').addEventListener('change', closeAcademyMenu);
const year = document.querySelector('#footer-year');
if (year) year.textContent = new Date().getFullYear();
// Prices follow the configured deadline in Peru, without relying on a stale launch banner.
document.querySelectorAll('[data-price-end]').forEach(block => {
  const deadline = Date.parse(block.dataset.priceEnd);
  const regular = Number(block.dataset.priceRegular);
  const launch = Number(block.dataset.priceLaunch);
  const promotion = Number.isFinite(deadline) && Date.now() < deadline;
  const amount = promotion ? launch : regular;
  if (!Number.isFinite(amount)) return;
  block.querySelector('[data-price-label]').textContent = promotion ? 'Precio de lanzamiento' : 'Precio regular';
  block.querySelector('[data-price-amount]').textContent = `US$ ${amount}`;
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('[data-academy-track]').forEach(track => {
  const controls = track.parentElement.querySelector('.academy-navigation');
  const buttons = [...controls.querySelectorAll('button')];
  const update = () => {
    const limit = track.scrollWidth - track.clientWidth;
    buttons[0].disabled = track.scrollLeft < 2;
    buttons[1].disabled = track.scrollLeft >= limit - 2;
  };
  const move = direction => {
    const first = track.firstElementChild;
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap);
    track.scrollBy({left: direction * step, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  };
  buttons.forEach(b => b.addEventListener('click', () => move(Number(b.dataset.programStep))));
  track.addEventListener('scroll', update, {passive:true});
  new ResizeObserver(update).observe(track);
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') track.scrollTo({left:event.key === 'Home' ? 0 : track.scrollWidth, behavior:reducedMotion.matches?'instant':'smooth'});
    else move(event.key === 'ArrowRight' ? 1 : -1);
  });
  update();
});
