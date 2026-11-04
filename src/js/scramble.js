// ─────────────────────────────────────────────────────────────────────────────
// Hexa Vision — Text Scramble
// ─────────────────────────────────────────────────────────────────────────────

export function scrambleText(selector, options = {}) {
  const {
    speed = 40,
    duration = 1200,
    characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}<>?',
    delayBetween = 20,
  } = options;

  const element = document.querySelector(selector);
  if (!element) return;

  const originalText = element.textContent;
  const output = Array(originalText.length).fill('');
  const resolveFrames = Array.from({ length: originalText.length }, (_, i) =>
    Math.floor(Math.random() * (duration / speed)) + i * (delayBetween / speed)
  );
  const lastFrame = Math.max(...resolveFrames);

  element.textContent = '';

  let frame = 0;
  const interval = setInterval(() => {
    for (let i = 0; i < originalText.length; i++) {
      output[i] =
        frame >= resolveFrames[i] || originalText[i] === ' '
          ? originalText[i]
          : characters.charAt(Math.floor(Math.random() * characters.length));
    }
    element.textContent = output.join('');
    frame++;

    if (frame > lastFrame) {
      clearInterval(interval);
      element.textContent = originalText;
    }
  }, speed);
}
