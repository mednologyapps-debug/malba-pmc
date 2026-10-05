// Shared navigation works with mouse, touch and keyboard.
const academyToggle = document.querySelector('.academy-menu-toggle');
const academyMenu = document.querySelector('#academy-menu');
const academyGroup = document.querySelector('.nav-academia');
function closeAcademyMenu() {
  clearTimeout(academyCloseTimer);
  academyToggle?.setAttribute('aria-expanded', 'false');
  if (academyMenu) academyMenu.hidden = true;
}
const academyDesktop = matchMedia('(min-width: 1131px) and (hover: hover)');
let academyCloseTimer;
function openAcademyMenu() {
  clearTimeout(academyCloseTimer);
  if (!academyMenu) return;
  academyMenu.style.setProperty('--academy-menu-top', `${document.querySelector('.site-header').getBoundingClientRect().bottom}px`);
  academyToggle.setAttribute('aria-expanded', 'true');
  academyMenu.hidden = false;
}
academyToggle?.addEventListener('click', () => {
  if (academyToggle.getAttribute('aria-expanded') === 'true') closeAcademyMenu();
  else openAcademyMenu();
});
academyGroup?.addEventListener('pointerenter', event => {
  if (academyDesktop.matches && event.pointerType === 'mouse') openAcademyMenu();
});
academyGroup?.addEventListener('pointerleave', () => {
  if (academyDesktop.matches) academyCloseTimer = setTimeout(() => {
    if (!academyMenu.contains(document.activeElement)) closeAcademyMenu();
  }, 240);
});
academyMenu?.addEventListener('pointerenter', () => clearTimeout(academyCloseTimer));
academyGroup?.addEventListener('focusin', event => {
  if (academyDesktop.matches && event.target.matches('.nav-link')) openAcademyMenu();
});
academyGroup?.addEventListener('focusout', event => {
  if (!academyGroup.contains(event.relatedTarget)) closeAcademyMenu();
});
window.addEventListener('resize', closeAcademyMenu);
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
    buttons[0].disabled = track.scrollLeft <= 3;
    buttons[1].disabled = track.scrollLeft >= limit - 3;
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

// Compact competency groups with keyboard controls.
document.querySelectorAll('[data-course-switch]').forEach(component => {
  const buttons = [...component.querySelectorAll('[data-course-panel]')];
  const panels = [...component.querySelectorAll('[data-course-content]')];
  const tabs = !!component.querySelector('[role="tablist"]');
  let active = 0;
  function select(index, focus = false) {
    active = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) => {
      button.setAttribute(tabs ? 'aria-selected' : 'aria-pressed', String(i === active));
      if (tabs) button.tabIndex = i === active ? 0 : -1;
    });
    panels.forEach((panel, i) => panel.hidden = i !== active);
    if (focus) buttons[active].focus();
    if (!reducedMotion.matches) panels[active].animate([{opacity:.35, transform:'translateY(6px)'},{opacity:1, transform:'translateY(0)'}], {duration:220,easing:'ease-out'});
  }
  buttons.forEach((button, i) => {
    button.addEventListener('click', () => select(i));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      select(event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1), true);
    });
  });
  component.classList.add('is-enhanced');
  select(0);
});
