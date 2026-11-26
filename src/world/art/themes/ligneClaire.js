import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 69 · Ligne claire : la bande dessinée franco-belge classique. Couleurs en aplats parfaitement
// uniformes (matériaux non éclairés : aucun modelé, aucune ombre), contour noir d'épaisseur constante
// autour de chaque forme, tiré des discontinuités de profondeur et des variations de couleur. Palette
// franche, claire, lisible. Seul le joueur, dont le matériau n'appartient pas à la salle, reste modelé.
const palette = { background: "#fdf6e3", primary: "#d83a2a", secondary: "#2a6ab0", accent: "#f0c030", text: "#1a1a1a" };

Effect.ShadersStore.artLigneClaireFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 screen;
uniform float far;
float depthAt(vec2 uv) { return texture2D(depthSampler, uv).r * far; }
void main(void) {
  vec2 t = 1.2 / screen;
  vec3 c = texture2D(textureSampler, vUV).rgb;
  float d = depthAt(vUV);
  float edge = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * t;
    float dd = depthAt(vUV + o);
    edge = max(edge, step(0.04 * max(d, 1.0), abs(dd - d)));
    vec3 cc = texture2D(textureSampler, vUV + o).rgb;
    edge = max(edge, step(0.22, length(cc - c)));
  }
  gl_FragColor = vec4(mix(c, vec3(0.08, 0.07, 0.07), edge), 1.0);
}`;

export const ligneClaire = {
  key: "ligne-claire",
  title: "Ligne claire",
  // Les matériaux de la salle sont non éclairés : l'ambiance ne sert qu'au joueur.
  ambient: { hemi: 1, sky: "#ffffff", ground: "#c0c0c0", sun: 0 },
  image: { contrast: 1 },
  glow: 0,

  look(scene, name) {
    // Aplat : couleur en émission pure, sans éclairage.
    const flat = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: "#000000", emissive: hex, unlit: true });
    const screens = new Map();
    return {
      palette,
      floor: flat("sol", "#e8d8b0"),
      wall: flat("mur", "#a8d0e8"),
      ceiling: flat("plafond", "#fdf6e3"),
      trim: flat("plinthe", "#2a6ab0"),
      doorFrame: flat("cadre", "#2a6ab0"),
      door: flat("porte", "#d83a2a"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#1a1a1a", background: "#fdf6e3", font: "bold 80px sans-serif" }) }),
      counter: flat("bar", "#d83a2a"),
      counterTop: flat("plateau", "#fdf6e3"),
      backBar: flat("fond du bar", "#3a8a5a"),
      shelf: flat("étagère", "#f0c030"),
      glass: (i) => flat(`bouteille ${i}`, ["#2a6ab0", "#d83a2a", "#3a8a5a", "#f0c030"][i % 4]),
      seat: flat("assise", "#f0c030"),
      tableTop: flat("table", "#fdf6e3"),
      metal: flat("pied", "#3a3a3a"),
      cabinet: (i) => flat(`borne ${i}`, ["#2a6ab0", "#d83a2a", "#3a8a5a", "#f0c030"][i % 4]),
      cabinetSide: () => flat("flanc", "#fdf6e3"),
      panel: flat("pupitre", "#3a3a3a"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => flat("bouton", "#fdf6e3"),
      scanlines: false,
    };
  },

  decorate() {},

  post(scene, camera) {
    const depth = scene.enableDepthRenderer(camera, false);
    // Le rendu des portails masque le calque du joueur pendant la passe principale (voir salle 67).
    depth.getDepthMap().renderListPredicate = (mesh) => mesh.isEnabled() && mesh.isVisible && mesh.subMeshes?.length > 0;
    const pass = new PostProcess("ligne claire", "artLigneClaire", ["screen", "far"], ["depthSampler"], 1, camera);
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("far", camera.maxZ);
      effect.setTexture("depthSampler", depth.getDepthMap());
    };
    return () => {
      pass.dispose(camera);
      scene.disableDepthRenderer(camera);
    };
  },
};
