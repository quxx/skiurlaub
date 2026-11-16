const target = new Date('2027-01-10T00:00:00+01:00').getTime();

const timeNodes = Object.fromEntries(
  [...document.querySelectorAll('[data-time]')].map((node) => [node.dataset.time, node]),
);

function updateCountdown() {
  const remaining = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const values = {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };

  Object.entries(values).forEach(([key, value]) => {
    const next = String(value).padStart(2, '0');
    if (timeNodes[key].textContent !== next) timeNodes[key].textContent = next;
  });
}

function setMode(mode) {
  document.body.dataset.mode = mode;
  document.querySelectorAll('[data-set-mode]').forEach((button) => {
    const isActive = button.dataset.setMode === mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

document.querySelectorAll('[data-set-mode]').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.setMode));
});

setMode('anticipation');
updateCountdown();
setInterval(updateCountdown, 1000);
