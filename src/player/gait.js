import { PLAYER } from "../config.js";

// Démarche affichée par le visuel du joueur (squelette ou modèle glTF), à l'échelle 1 :
// vitesse horizontale et vitesse verticale en m/s.
export function gaitOf(speed, grounded, verticalSpeed) {
  if (!grounded) return verticalSpeed > 0.15 ? "jump" : "fall";
  if (speed < 0.12) return "idle";
  return speed > PLAYER.walkSpeed + 0.4 ? "run" : "walk";
}
