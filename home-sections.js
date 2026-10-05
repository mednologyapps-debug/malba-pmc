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
