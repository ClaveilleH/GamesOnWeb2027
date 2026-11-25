import { comicToon } from "./themes/comicToon.js";
import { filmNoir } from "./themes/filmNoir.js";
import { synthwave } from "./themes/synthwave.js";
import { REALISM } from "./themes/realism.js";
import { cyberpunk } from "./themes/cyberpunk.js";
import { pixel } from "./themes/pixel.js";
import { memphis } from "./themes/memphis.js";
import { blueprint } from "./themes/blueprint.js";
import { neonViolet } from "./themes/neonViolet.js";
import { warmBistro } from "./themes/warmBistro.js";

// Directions artistiques, une salle chacune, dans l'ordre de visite.
export const THEMES = Object.freeze([neonViolet, warmBistro, comicToon, filmNoir, synthwave, ...REALISM, cyberpunk, pixel, memphis, blueprint]);
