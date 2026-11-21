export function createHud(bindings, layout, portals) {
  const hint = document.querySelector("#capture-hint");
  const movementKeys = document.querySelector("#movement-keys");
  const telemetry = document.querySelector("#player-state");
  const contact = document.querySelector("#ground-state");
  const speedLabel = document.querySelector("#speed");
  const depthLabel = document.querySelector("#portal-depth");
  const passesLabel = document.querySelector("#portal-passes");
  const fpsLabel = document.querySelector("#fps");
  const listeners = new AbortController();
  const options = { signal: listeners.signal };

  function showMovementKeys() {
    const labels = ["forward", "left", "back", "right"].map((action) => {
      const [primary, secondary] = bindings.keys(action);
      return layout.label(primary ?? secondary);
    });
    movementKeys.textContent = labels.join(labels.every((key) => key.length === 1) ? "" : " · ");
  }
  showMovementKeys();
  bindings.changes.addEventListener("change", showMovementKeys, options);
  layout.changes.addEventListener("change", showMovementKeys, options);

  function update({ position, speed, grounded, scale }, camera, visualRoot) {
    const feet = visualRoot.position;
    const values = {
      x: position.x.toFixed(3), y: position.y.toFixed(3), z: position.z.toFixed(3),
      speed: speed.toFixed(2), grounded: String(grounded), scale: String(scale),
      cameraYaw: camera.yaw.toFixed(5), cameraPitch: camera.pitch.toFixed(5),
      renderX: feet.x.toFixed(5), renderY: feet.y.toFixed(5), renderZ: feet.z.toFixed(5),
      renderYaw: visualRoot.rotation.y.toFixed(5),
    };
    for (const [key, value] of Object.entries(values)) {
      if (telemetry.dataset[key] !== value) telemetry.dataset[key] = value;
    }
    const groundText = grounded ? "Au sol" : "En l’air";
    if (contact.textContent !== groundText) contact.textContent = groundText;
    const speedText = speed.toFixed(1).replace(".", ",");
    if (speedLabel.textContent !== speedText) speedLabel.textContent = speedText;
  }

  return {
    update,
    updatePortals(fps) {
      const { depthReached, passes } = portals.stats;
      const depth = depthReached + "/" + portals.settings.maxDepth;
      if (depthLabel.textContent !== depth) {
        depthLabel.textContent = depth;
        telemetry.dataset.portalDepth = String(depthReached);
      }
      if (telemetry.dataset.portalPasses !== String(passes)) {
        telemetry.dataset.portalPasses = passesLabel.textContent = String(passes);
      }
      const rounded = String(Math.round(fps));
      if (telemetry.dataset.fps !== rounded) telemetry.dataset.fps = fpsLabel.textContent = rounded;
    },
    showCaptureHint(visible) { hint.hidden = !visible; },
    toggleDebug() {
      telemetry.hidden = !telemetry.hidden;
      portals.setDebugVisible(!telemetry.hidden);
    },
    dispose: () => listeners.abort(),
  };
}
