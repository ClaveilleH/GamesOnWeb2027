const CAPTURE_SETTLE_MS = 100;
const MAX_MOUSE_DELTA = 250;
const LOCK_RETRY_MARGIN_MS = 20;
const LOCK_RETRY_MIN_MS = 50;
const LOCK_RETRY_FALLBACK_MS = 250;
const LOCK_RETRIES = 6;
const SYSTEM_KEYS = new Set(["MetaLeft", "MetaRight", "OSLeft", "OSRight"]);
// Descente en vol (menu debug). La montée reprend les touches de saut.
export const FLY_DOWN_CODE = "KeyC";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createInput(canvas, bindings, platform, { isPaused, openMenu, onCapture, toggleDebug, toggleDebugMenu = () => {} }) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const held = new Set();
  let captured = false;
  let capturePending = false;
  let relockOnRelease = null;
  let awaitingLock = false;
  // Souris libérée par Tab pour cliquer dans le menu debug : le jeu continue, sans pause.
  let freeCursor = false;
  let descending = false;
  let userExitAt = -Infinity;
  let ignoreMouseUntil = 0;
  let jump = false;
  let respawn = false;
  let interact = false;
  let lookX = 0;
  let lookY = 0;
  let virtual = null;
  const controls = {
    forward: 0, strafe: 0, sprint: false, jump: false, respawn: false, interact: false, up: false, down: false, lookX: 0, lookY: 0,
  };

  function hasCapture() {
    return captured && document.pointerLockElement === canvas;
  }

  function canLook() {
    return (hasCapture() || awaitingLock) && document.hasFocus() && !isPaused();
  }

  function setAwaitingLock(value) {
    awaitingLock = value;
    canvas.classList.toggle("awaiting-lock", value);
  }

  function reset() {
    held.clear();
    descending = false;
    virtual = null;
    jump = respawn = interact = false;
    lookX = lookY = 0;
  }

  function pause() {
    captured = false;
    freeCursor = false;
    relockOnRelease = null;
    reset();
    openMenu();
    onCapture(false);
    document.exitPointerLock?.();
  }

  // Délai avant de retenter une capture refusée, ou null si le refus est définitif.
  // Un SecurityError signale un délai imposé après une sortie par Échap : il mérite une
  // nouvelle tentative, tant que le geste qui a demandé la capture reste valide.
  function lockRetryDelay(error) {
    if (error?.name !== "SecurityError" || navigator.userActivation?.isActive === false) return null;
    const delay = platform.lockDelayAfterUserExitMs;
    if (!delay || !Number.isFinite(userExitAt)) return LOCK_RETRY_FALLBACK_MS;
    return Math.max(LOCK_RETRY_MIN_MS, userExitAt + delay + LOCK_RETRY_MARGIN_MS - performance.now());
  }

  function onLocked() {
    if (isPaused() || document.hidden || !document.hasFocus()) {
      pause();
      return;
    }
    lookX = lookY = 0;
    ignoreMouseUntil = performance.now() + CAPTURE_SETTLE_MS;
    captured = true;
    onCapture(true);
  }

  async function capture() {
    if (isPaused()) return;
    freeCursor = false;
    relockOnRelease = null;
    canvas.focus({ preventScroll: true });
    // Le navigateur peut avoir gardé le verrou pendant la pause (blur, sortie refusée) :
    // il suffit alors de le reprendre, une nouvelle demande serait sans effet.
    if (document.pointerLockElement === canvas) {
      if (!captured) onLocked();
      return;
    }
    onCapture(false);
    if (capturePending) return;
    capturePending = true;
    try {
      for (let attempt = 0; ; attempt++) {
        let delay;
        try {
          await canvas.requestPointerLock?.();
          return;
        } catch (error) {
          // Un refus définitif laisse le clavier actif et l’indice de capture visible.
          delay = attempt < LOCK_RETRIES ? lockRetryDelay(error) : null;
          if (delay === null) return;
        }
        // Pendant l’attente, la caméra suit déjà la souris, curseur masqué,
        // pour que la reprise paraisse immédiate.
        if (!awaitingLock) {
          setAwaitingLock(true);
          onCapture(true);
        }
        await wait(delay);
        if (listeners.signal.aborted || isPaused() || document.pointerLockElement === canvas) return;
      }
    } finally {
      capturePending = false;
      if (awaitingLock) {
        setAwaitingLock(false);
        if (!isPaused() && document.pointerLockElement !== canvas) onCapture(false);
      }
    }
  }

  // Reprise depuis le menu : `key` est la touche qui l’a fermé, s’il y en a une.
  // Firefox libère la souris au relâchement d’Échap : une capture faite pendant l’appui
  // serait aussitôt annulée et rouvrirait le menu. Attendre le relâchement ne coûte
  // rien ailleurs, car aucun navigateur n’accorde la capture sur Échap.
  // Sans capture en cours, Tab empêche tout de même les touches de jeu de reprendre la souris.
  function releaseCursor() {
    // captured passe à faux avant la libération : pointerlockchange n’ouvre donc pas le menu.
    captured = false;
    freeCursor = true;
    lookX = lookY = 0;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function resume(key) {
    if (key === "Escape") {
      canvas.focus({ preventScroll: true });
      relockOnRelease = key;
      return;
    }
    capture();
  }

  canvas.addEventListener("click", capture, options);
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) {
      onLocked();
    } else if (captured) {
      // Libération voulue par le navigateur (Échap, touche système) : on la date.
      userExitAt = performance.now();
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
    if (code === "KeyD" && (event.ctrlKey || event.metaKey)) {
      // Remplace le raccourci « ajouter un favori » du navigateur.
      event.preventDefault();
      if (!event.repeat) toggleDebugMenu();
      return;
    }
    if (code === "Tab") {
      event.preventDefault();
      if (event.repeat) return;
      if (freeCursor) capture();
      else releaseCursor();
      return;
    }
    if (code === "Escape") {
      event.preventDefault();
      if (!event.repeat) pause();
      return;
    }
    // Firefox garde la souris capturée quand la touche système ouvre le lanceur du bureau ;
    // Chromium la libère déjà, la pause revient donc au même.
    if (SYSTEM_KEYS.has(code) && hasCapture()) {
      pause();
      return;
    }
    if (!event.repeat && !freeCursor && document.pointerLockElement !== canvas) capture();
    const action = bindings.actionFor(code);
    if (action || code === "Space" || code.startsWith("Arrow")) event.preventDefault();
    if (code === FLY_DOWN_CODE) descending = true;
    if (!action || event.repeat || held.has(code)) return;
    held.add(code);
    if (action === "jump") jump = true;
    if (action === "respawn") respawn = true;
    if (action === "interact") interact = true;
  }, options);
  window.addEventListener("keyup", (event) => {
    held.delete(event.code);
    if (event.code === FLY_DOWN_CODE) descending = false;
    if (event.code === relockOnRelease) capture();
  }, options);
  window.addEventListener("blur", pause, options);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  }, options);

  const isHeld = (code) => held.has(code);
  const pressed = (action) => bindings.keys(action).some(isHeld);
  function axis(positive, negative, virtualValue = 0) {
    return Math.max(-1, Math.min(1, Number(pressed(positive)) - Number(pressed(negative)) + virtualValue));
  }
  return {
    resume,
    get cursorFree() { return freeCursor; },
    setControls(controls) {
      if (controls?.jump && !virtual?.jump) jump = true;
      virtual = controls;
    },
    read() {
      const looking = canLook();
      controls.forward = axis("forward", "back", virtual?.forward);
      controls.strafe = axis("right", "left", virtual?.strafe);
      controls.sprint = pressed("sprint") || Boolean(virtual?.sprint);
      controls.jump = jump;
      controls.respawn = respawn;
      controls.interact = interact;
      controls.up = pressed("jump") || Boolean(virtual?.up);
      controls.down = descending || Boolean(virtual?.down);
      controls.lookX = looking ? lookX : 0;
      controls.lookY = looking ? lookY : 0;
      jump = respawn = interact = false;
      lookX = lookY = 0;
      return controls;
    },
    dispose() {
      listeners.abort();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      reset();
    },
  };
}
