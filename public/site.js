const progress = document.querySelector(".scroll-progress");
const revealItems = document.querySelectorAll(".reveal");
const counters = document.querySelectorAll("[data-count]");
let countersStarted = false;

function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = max > 0 ? window.scrollY / max : 0;
  progress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function animateCounters() {
  if (countersStarted) {
    return;
  }
  countersStarted = true;
  counters.forEach((node) => {
    const target = Number(node.dataset.count || 0);
    const duration = target === 0 ? 220 : 920;
    const start = performance.now();

    function tick(now) {
      const ratio = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      node.textContent = String(Math.round(target * eased));
      if (ratio < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }
      entry.target.classList.add("is-visible");
      if (entry.target.querySelector("[data-count]")) {
        animateCounters();
      }
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.16 }
);

revealItems.forEach((item) => observer.observe(item));

function bindTabs(buttonSelector, panelSelector, buttonAttr, panelAttr) {
  const buttons = document.querySelectorAll(buttonSelector);
  const panels = document.querySelectorAll(panelSelector);
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute(buttonAttr);
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.getAttribute(panelAttr) === target);
      });
    });
  });
}

bindTabs("[data-device-tab]", "[data-device-panel]", "data-device-tab", "data-device-panel");
bindTabs("[data-flow-tab]", "[data-flow-panel]", "data-flow-tab", "data-flow-panel");

document.querySelectorAll(".feature-card, .scenario, .strip-item").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 6;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * -6;
    card.style.transform = `translateY(-4px) rotateX(${y}deg) rotateY(${x}deg)`;
  });
  card.addEventListener("pointerleave", () => {
    card.style.transform = "";
  });
});

window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);
updateProgress();
