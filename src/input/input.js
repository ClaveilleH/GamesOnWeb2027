const CAPTURE_SETTLE_MS = 100;
const MAX_MOUSE_DELTA = 250;

export function createInput(canvas, bindings, { isPaused, openMenu, onCapture, toggleDebug }) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const held = new Set();
  let captured = false;
  let ignoreMouseUntil = 0;
  let jump = false;
  let respawn = false;
  let lookX = 0;
  let lookY = 0;

  function canLook() {
    return captured && document.pointerLockElement === canvas && document.hasFocus() && !isPaused();
  }

  function reset() {
    held.clear();
    jump = respawn = false;
    lookX = lookY = 0;
  }

  function pause() {
    captured = false;
    reset();
    openMenu();
    onCapture(false);
    document.exitPointerLock?.();
  }

  async function capture() {
    if (isPaused()) return;
    canvas.focus({ preventScroll: true });
    onCapture(captured);
    if (captured && document.pointerLockElement === canvas) return;
    try {
      await canvas.requestPointerLock?.();
    } catch {
      // Un refus de recapture laisse le clavier actif et l'indice de clic visible.
    }
  }

  canvas.addEventListener("click", capture, options);
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) {
      if (isPaused() || document.hidden || !document.hasFocus()) {
        pause();
        return;
      }
      lookX = lookY = 0;
      ignoreMouseUntil = performance.now() + CAPTURE_SETTLE_MS;
      captured = true;
      onCapture(true);
    } else if (captured) {
      pause();
    }
  }, options);
  document.addEventListener("mousemove", (event) => {
    // Le recentrage peut arriver après pointerlockchange, parfois avec un grand delta isolé.
    if (!canLook() || performance.now() < ignoreMouseUntil) return;
    const { movementX, movementY } = event;
    if (Math.abs(movementX) > MAX_MOUSE_DELTA || Math.abs(movementY) > MAX_MOUSE_DELTA) return;
    lookX += movementX;
    lookY += movementY;
  }, options);

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || !document.hasFocus()) return;
    const { code } = event;
    if (code === "F3") {
      event.preventDefault();
      if (!event.repeat) toggleDebug();
      return;
    }
    if (isPaused()) return;
    if (code === "Escape") {
      event.preventDefault();
      if (!event.repeat) pause();
      return;
    }
    const action = bindings.actionFor(code);
    if (action || code === "Space" || code.startsWith("Arrow")) event.preventDefault();
    if (!action || event.repeat || held.has(code)) return;
    held.add(code);
    if (action === "jump") jump = true;
    if (action === "respawn") respawn = true;
  }, options);
  window.addEventListener("keyup", (event) => held.delete(event.code), options);
  window.addEventListener("blur", pause, options);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  }, options);

  const pressed = (action) => bindings.keys(action).some((code) => held.has(code));
  return {
    capture,
    read() {
      const looking = canLook();
      const input = {
        forward: Number(pressed("forward")) - Number(pressed("back")),
        strafe: Number(pressed("right")) - Number(pressed("left")),
        sprint: pressed("sprint"),
        jump, respawn, lookX: looking ? lookX : 0, lookY: looking ? lookY : 0,
      };
      jump = respawn = false;
      lookX = lookY = 0;
      return input;
    },
    dispose() {
      listeners.abort();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      reset();
    },
  };
}
