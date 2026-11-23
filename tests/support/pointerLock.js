// Imite le pointer lock réel : le navigateur intercepte Échap pendant la capture,
// Chromium le libère à l’appui et refuse une recapture pendant 1250 ms,
// Firefox le libère au relâchement. Une capture exige un geste utilisateur.
export async function emulatePointerLock(page, browser = "chromium") {
  await page.addInitScript((browser) => {
    let locked = null;
    let userExitAt = -Infinity;
    window.lockRequests = 0;
    Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
    const changed = () => document.dispatchEvent(new Event("pointerlockchange"));
    HTMLCanvasElement.prototype.requestPointerLock = async function () {
      window.lockRequests++;
      if (!navigator.userActivation.isActive) throw new DOMException("Geste requis", "NotAllowedError");
      if (browser === "chromium" && performance.now() - userExitAt < 1250) {
        throw new DOMException("Pointer lock cannot be acquired immediately after the user has exited the lock.", "SecurityError");
      }
      locked = this;
      window.lockedAt = performance.now();
      changed();
    };
    document.exitPointerLock = () => {
      if (!locked) return;
      locked = null;
      changed();
    };
    const exitOn = browser === "firefox" ? "keyup" : "keydown";
    for (const type of ["keydown", "keyup"]) {
      window.addEventListener(type, (event) => {
        if (event.code !== "Escape" || !locked) return;
        // Le navigateur consomme cet Échap : la page ne le voit pas.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type === exitOn) {
          userExitAt = window.userExitAt = performance.now();
          document.exitPointerLock();
        }
      }, true);
    }
  }, browser);
}
