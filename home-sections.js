const heroTrack = document.querySelector(".hero-track");
const heroSlides = [...document.querySelectorAll(".hero-slide")];
const heroDots = [...document.querySelectorAll("[data-slide-to]")];
const sliderStatus = document.querySelector("#slider-status");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let activeHeroSlide = 0;
let heroScrollFrame = 0;
function fitHeroHeight() {
  heroTrack.style.height = `${heroSlides[activeHeroSlide].getBoundingClientRect().height}px`;
}
function updateHeroSlide(index) {
  if (index === activeHeroSlide) return;
  activeHeroSlide = index;
  heroSlides.forEach((slide, number) => {
    slide.inert = number !== index;
    slide.setAttribute("aria-hidden", String(number !== index));
  });
  heroDots.forEach((dot, number) => {
    dot.classList.toggle("is-active", number === index);
    dot.setAttribute("aria-pressed", String(number === index));
  });
  sliderStatus.textContent = `Banner ${index + 1} de 2: ${index === 0 ? "MALBA PMC" : "Libro de Miguel Alba"}`;
  fitHeroHeight();
}
function goToHeroSlide(index) {
  const target = (index + heroSlides.length) % heroSlides.length;
  heroTrack.scrollTo({
    left: target * heroTrack.clientWidth,
    behavior: motionPreference.matches ? "instant" : "smooth",
  });
}
document
  .querySelectorAll("[data-slide-step]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      goToHeroSlide(activeHeroSlide + Number(button.dataset.slideStep)),
    ),
  );
heroDots.forEach((button) =>
  button.addEventListener("click", () =>
    goToHeroSlide(Number(button.dataset.slideTo)),
  ),
);
heroTrack.addEventListener(
  "scroll",
  () => {
    if (heroScrollFrame) return;
    heroScrollFrame = requestAnimationFrame(() => {
      heroScrollFrame = 0;
      updateHeroSlide(Math.round(heroTrack.scrollLeft / heroTrack.clientWidth));
    });
  },
  { passive: true },
);
heroTrack.addEventListener("keydown", (event) => {
  if (
    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
    event.target !== heroTrack
  )
    return;
  event.preventDefault();
  goToHeroSlide(
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? heroSlides.length - 1
        : activeHeroSlide + (event.key === "ArrowRight" ? 1 : -1),
  );
});
let previousHeroWidth = heroTrack.clientWidth;
new ResizeObserver(() => {
  const width = heroTrack.clientWidth;
  if (width !== previousHeroWidth) {
    previousHeroWidth = width;
    heroTrack.scrollTo({ left: activeHeroSlide * width, behavior: "instant" });
  }
  fitHeroHeight();
}).observe(heroTrack);
const slideSizeObserver = new ResizeObserver(fitHeroHeight);
heroSlides.forEach((slide) => slideSizeObserver.observe(slide));
fitHeroHeight();

// Carruseles compactos: navegación táctil, teclado y botones, sin autoplay.
document.querySelectorAll('[data-collection]').forEach((controls) => {
  const list = document.getElementById(controls.dataset.collection);
  const buttons = [...controls.querySelectorAll('[data-collection-step]')];
  function syncControls() {
    buttons.forEach((button) => {
      button.disabled = Number(button.dataset.collectionStep) < 0
        ? list.scrollLeft < 2
        : list.scrollLeft >= list.scrollWidth - list.clientWidth - 2;
    });
  }
  function move(direction) {
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    list.scrollBy({left: direction * (list.firstElementChild.getBoundingClientRect().width + gap), behavior: motionPreference.matches ? 'instant' : 'smooth'});
  }
  buttons.forEach((button) => button.addEventListener('click', () => move(Number(button.dataset.collectionStep))));
  list.addEventListener('keydown', (event) => {
    if (event.target !== list || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
  });
  list.addEventListener('scroll', syncControls, {passive: true});
  new ResizeObserver(syncControls).observe(list);
  syncControls();
});

const knowledgeContent = [
  ['Experiencia que sirve de punto de partida', 'Partimos de los desafíos de proyectos de infraestructura eléctrica para identificar qué funciona, qué puede mejorar y qué merece compartirse.'],
  ['Lecciones que no se quedan en un proyecto', 'Recogemos los aprendizajes y los organizamos para que otros equipos puedan aprovecharlos en sus próximos desafíos.'],
  ['Metodologías para decidir con claridad', 'Convertimos las lecciones en criterios y formas de trabajo que ayudan a planificar, controlar y gestionar los riesgos.'],
  ['Formación conectada con la realidad', 'Llevamos ese conocimiento a programas ejecutivos con casos y ejercicios aplicados al sector de infraestructura eléctrica.'],
  ['Herramientas para aprender haciendo', 'Los simuladores permiten practicar decisiones y explorar escenarios antes de trasladarlos a la ejecución del proyecto.'],
  ['Conocimiento que se pone en práctica', 'Aplicamos lo aprendido a la gestión diaria, adaptando los criterios y herramientas a las necesidades de cada organización.'],
  ['Resultados que abren un nuevo ciclo', 'Revisamos las decisiones y sus resultados para encontrar nuevas oportunidades de mejora y alimentar la siguiente experiencia.'],
];
const knowledgeSteps = [...document.querySelectorAll('[data-knowledge-step]')];
const knowledgeList = document.querySelector('.knowledge-steps');
const knowledgeDetail = document.querySelector('.knowledge-detail');
let activeKnowledge = 0;
let detailAnimationFrame;
function selectKnowledge(index, focus = false) {
  activeKnowledge = (index + knowledgeSteps.length) % knowledgeSteps.length;
  knowledgeSteps.forEach((button, number) => button.setAttribute('aria-pressed', String(number === activeKnowledge)));
  const number = String(activeKnowledge + 1).padStart(2, '0');
  document.querySelector('#knowledge-number').textContent = number;
  document.querySelector('#knowledge-position').textContent = `${number} / 07`;
  document.querySelector('#knowledge-detail-title').textContent = knowledgeContent[activeKnowledge][0];
  document.querySelector('#knowledge-detail-text').textContent = knowledgeContent[activeKnowledge][1];
  knowledgeList.style.setProperty('--cycle-scale', activeKnowledge / 6);
  document.querySelector('.knowledge-orbit').style.setProperty('--orbit-angle', `${activeKnowledge * 51.4}deg`);
  knowledgeDetail.classList.remove('is-changing');
  cancelAnimationFrame(detailAnimationFrame);
  if (!motionPreference.matches) detailAnimationFrame = requestAnimationFrame(() => knowledgeDetail.classList.add('is-changing'));
  const target = knowledgeSteps[activeKnowledge];
  if (knowledgeList.scrollWidth > knowledgeList.clientWidth) knowledgeList.scrollTo({left: target.parentElement.offsetLeft - knowledgeList.clientWidth / 2 + target.parentElement.clientWidth / 2, behavior: motionPreference.matches ? 'instant' : 'smooth'});
  if (focus) target.focus({preventScroll: true});
}
knowledgeSteps.forEach((button, index) => {
  button.parentElement.style.setProperty('--step-order', index);
  button.addEventListener('click', () => selectKnowledge(index));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    selectKnowledge(event.key === 'Home' ? 0 : event.key === 'End' ? 6 : activeKnowledge + (event.key === 'ArrowRight' ? 1 : -1), true);
  });
});
document.querySelectorAll('[data-knowledge-direction]').forEach((button) => button.addEventListener('click', () => selectKnowledge(activeKnowledge + Number(button.dataset.knowledgeDirection))));
const knowledgeObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    if (!motionPreference.matches) knowledgeList.classList.add('is-entering');
    knowledgeObserver.disconnect();
  }
}, {threshold: .35});
knowledgeObserver.observe(knowledgeList);

// El diálogo comparte cierre, Escape y retorno de foco con los demás popups.
const youtubeDialog = document.querySelector('#video-dialog');
const youtubePlayer = document.querySelector('#youtube-player');
document.querySelectorAll('[data-youtube-id]').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.youtubeId;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return;
    const title = button.dataset.videoTitle;
    document.querySelector('#video-dialog-title').textContent = title;
    document.querySelector('#youtube-direct-link').href = `https://www.youtube.com/watch?v=${id}`;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`;
    iframe.title = title;
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    youtubePlayer.replaceChildren(iframe);
  });
});
youtubeDialog.addEventListener('close', () => youtubePlayer.replaceChildren());

// Año del pie de página, sin dependencias ni llamadas externas.
document.querySelector("#footer-year").textContent = new Date().getFullYear();
