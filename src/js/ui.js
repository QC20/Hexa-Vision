// ─────────────────────────────────────────────────────────────────────────────
// Hexa Vision — Interface
//
// The control panel, the corner button that opens it, the intro overlay and
// the small hints. Everything here gets out of the way: the panel closes,
// and the corner button fades out when nobody is touching anything.
// ─────────────────────────────────────────────────────────────────────────────

import { scrambleText } from './scramble.js';

const IDLE_DELAY = 2800;

export function createUI(app) {
  const body     = document.body;
  const panel    = document.getElementById('panel');
  const fab      = document.getElementById('ui-toggle');
  const toastEl  = document.getElementById('toast');
  const swatchEl = document.getElementById('swatches');
  const sliders  = [...panel.querySelectorAll('input[data-param]')];
  const toggles  = [...panel.querySelectorAll('input[data-toggle]')];
  const coarse   = matchMedia('(pointer: coarse)').matches;

  let panelOpen = false;

  // ── Panel ──────────────────────────────────────────────────

  function setPanel(open) {
    panelOpen = open;
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    fab.setAttribute('aria-expanded', String(open));
    body.classList.toggle('panel-open', open);
    if (open) sync();
    wake();
  }

  fab.addEventListener('click', () => setPanel(!panelOpen));

  // ── Idle fade ──────────────────────────────────────────────

  let idleTimer = 0;

  function wake() {
    body.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!panelOpen) body.classList.add('is-idle');
    }, IDLE_DELAY);
  }

  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });

  // ── Sliders ────────────────────────────────────────────────

  function paintSlider(input) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const value = parseFloat(input.value);
    input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);

    const decimals = (input.step.split('.')[1] || '').length;
    input.closest('.slider').querySelector('output').textContent = value.toFixed(Math.min(decimals, 2));
  }

  sliders.forEach(input => {
    input.addEventListener('input', () => {
      app.setParam(input.dataset.param, parseFloat(input.value));
      paintSlider(input);
    });
  });

  // ── Palettes ───────────────────────────────────────────────

  const swatches = app.palettes.map(palette => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.title = palette.name;
    button.setAttribute('aria-label', `${palette.name} palette`);
    button.style.background =
      `linear-gradient(135deg, ${palette.highlight} 0%, ${palette.fill} 55%, ${palette.outline} 100%)`;
    button.addEventListener('click', () => {
      app.choosePalette(palette);
      sync();
    });
    swatchEl.append(button);
    return { button, palette };
  });

  // ── Toggles ────────────────────────────────────────────────

  const sensorToggle = (sensor, blockedMessage) => async input => {
    if (!input.checked) return sensor.stop();
    try {
      await sensor.start();
    } catch {
      input.checked = false;
      toast(blockedMessage);
    }
  };

  const toggleHandlers = {
    eye:       input => app.setEye(input.checked),
    wireframe: input => app.setWireframe(input.checked),
    tilt:      sensorToggle(app.tilt, 'Motion access was blocked'),
    mic:       sensorToggle(app.mic, 'Microphone access was blocked'),
  };

  toggles.forEach(input => {
    input.addEventListener('change', () => toggleHandlers[input.dataset.toggle](input));
  });

  // Hide what this device can't do.
  panel.querySelector('[data-feature="tilt"]').hidden = !app.tilt.supported;
  panel.querySelector('[data-feature="mic"]').hidden = !app.mic.supported;
  panel.querySelector('[data-action="fullscreen"]').hidden = !app.canFullscreen;

  // ── Actions ────────────────────────────────────────────────

  const actions = {
    shuffle:    () => app.shuffle(),
    drift:      () => app.setDrift(!app.drift),
    fullscreen: () => app.toggleFullscreen(),
    snapshot:   async () => {
      const result = await app.snapshot();
      if (result === 'saved') toast('Image saved');
    },
    hide: () => {
      setPanel(false);
      clearTimeout(idleTimer);
      body.classList.add('is-idle');
    },
  };

  document.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (button) actions[button.dataset.action]?.();
  });

  // ── Keyboard ───────────────────────────────────────────────

  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    switch (e.key.toLowerCase()) {
      case ' ':
        if (tag === 'BUTTON') return;
        e.preventDefault();
        app.shuffle();
        break;
      case 'h': body.classList.toggle('ui-hidden'); break;
      case 'c': setPanel(!panelOpen); break;
      case 'd': actions.drift(); break;
      case 's': actions.snapshot(); break;
      case 'f': if (app.canFullscreen) actions.fullscreen(); break;
      case 'escape': setPanel(false); break;
    }
  });

  // ── Sync from app state ────────────────────────────────────

  function sync() {
    sliders.forEach(input => {
      const value = app.params[input.dataset.param];
      if (value === undefined) return;
      input.value = value;
      paintSlider(input);
    });

    swatches.forEach(({ button, palette }) => {
      button.setAttribute('aria-pressed', String(palette === app.palette));
    });

    panel.querySelector('[data-action="drift"]').setAttribute('aria-pressed', String(app.drift));

    const state = {
      eye: app.params.eye > 0.5,
      wireframe: app.wireframe,
      tilt: app.tilt.active,
      mic: app.mic.active,
    };
    toggles.forEach(input => { input.checked = state[input.dataset.toggle]; });
  }

  // ── Toast ──────────────────────────────────────────────────

  let toastTimer = 0;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2400);
  }

  // ── Intro ──────────────────────────────────────────────────
  // Hexagon draws itself → title resolves → the overlay opens and the scene
  // comes into focus behind the title → title dissolves → gesture hint.

  function playIntro({ onReveal }) {
    const intro = document.getElementById('intro');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scale = reduced ? 0.3 : 1;
    const timers = [];
    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      intro.classList.add('is-revealing');
      onReveal();
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add('is-done');
      timers.push(setTimeout(() => {
        intro.remove();
        body.classList.add('is-live');
        showHint();
        wake();
        scheduleNotification();
      }, 800 * scale));
    };

    body.classList.add('is-ready');
    if (!reduced) scrambleText('.intro__title', { speed: 30, duration: 900, delayBetween: 40 });

    timers.push(setTimeout(reveal, 1100 * scale));
    timers.push(setTimeout(finish, 2700 * scale));

    // Tapping during the intro skips ahead.
    intro.addEventListener('pointerdown', () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      reveal();
      finish();
    }, { once: true });
  }

  function showHint() {
    const hint = document.getElementById('hint');
    hint.textContent = coarse
      ? 'drag to spin · pinch to zoom · tap to ripple · double-tap to shuffle'
      : 'drag to spin · scroll to zoom · click to ripple · double-click to shuffle';
    hint.classList.add('is-shown');

    const hide = () => hint.classList.remove('is-shown');
    setTimeout(hide, 6000);
    document.getElementById('scene').addEventListener('pointerdown', hide, { once: true });
  }

  // ── Notification ───────────────────────────────────────────

  function scheduleNotification() {
    const notification = document.getElementById('notification');
    let autoHide = 0;
    const hide = () => {
      clearTimeout(autoHide);
      notification.classList.remove('is-shown');
    };

    setTimeout(() => {
      notification.classList.add('is-shown');
      autoHide = setTimeout(hide, 14000);
    }, 9000);

    document.getElementById('closeBtn').addEventListener('click', hide);
  }

  setPanel(false);

  return { sync, toast, playIntro };
}
