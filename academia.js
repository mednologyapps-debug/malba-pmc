// Visual menus share mouse, touch and keyboard behavior.
const menuClosers=[];
document.querySelectorAll('.nav-academia').forEach(group=>{
  const toggle=group.querySelector('.academy-menu-toggle'),menu=group.querySelector('.academy-menu');
  const desktop=matchMedia('(min-width: 1131px) and (hover: hover)');let timer;
  const close=()=>{clearTimeout(timer);toggle.setAttribute('aria-expanded','false');menu.hidden=true;};
  menuClosers.push(close);
  const open=()=>{menuClosers.forEach(fn=>{if(fn!==close)fn();});clearTimeout(timer);menu.style.setProperty('--academy-menu-top',`${document.querySelector('.site-header').getBoundingClientRect().bottom}px`);toggle.setAttribute('aria-expanded','true');menu.hidden=false;};
  toggle.addEventListener('click',()=>menu.hidden?open():close());
  group.addEventListener('pointerenter',e=>{if(desktop.matches&&e.pointerType==='mouse')open();});
  group.addEventListener('pointerleave',()=>{if(desktop.matches)timer=setTimeout(()=>{if(!group.contains(document.activeElement))close();},240);});
  menu.addEventListener('pointerenter',()=>clearTimeout(timer));
  group.addEventListener('focusin',e=>{if(desktop.matches&&e.target.matches('.nav-link'))open();});
  group.addEventListener('focusout',e=>{if(!group.contains(e.relatedTarget))close();});
  group.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.stopPropagation();close();toggle.focus();}});
  document.addEventListener('click',e=>{if(!group.contains(e.target))close();});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  window.addEventListener('resize',close);document.querySelector('.menu-toggle')?.addEventListener('click',close);
  matchMedia('(min-width:1131px)').addEventListener('change',close);
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const openMenu=document.querySelector('.nav-academia .academy-menu:not([hidden])');
  if(openMenu){menuClosers.forEach(close=>close());openMenu.parentElement.querySelector('.academy-menu-toggle').focus();}
});
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
