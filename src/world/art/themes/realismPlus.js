import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { lights, makeLook } from "./realism.js";

// Salle 27 · Réalisme 6 : sommet de l'échelle de réalisme (salles 6 à 10), même décor et mêmes lumières.
// Les reflets ne viennent plus d'un miroir plan ni seulement d'une sonde : des réflexions en espace écran
// (SSR) font refléter chaque surface brillante selon sa rugosité, sol, comptoir, bornes et chrome compris.
// S'y ajoutent l'occlusion ambiante, un bloom doux et l'anticrénelage multi-échantillons.
export const realismPlus = {
  level: 6,
  key: "realisme-6",
  title: "Réalisme 6 · réflexions en espace écran",
  ambient: { hemi: 0.35, sky: "#fff4e6", ground: "#5a5048" },
  image: { toneMapping: "aces", exposure: 1.2, contrast: 1.1 },
  glow: 0,

  // Carrelage vitrifié et plateau poli : assez lisses pour que les réflexions en espace écran se voient.
  look(scene, name) {
    const look = makeLook(scene, name, 6);
    // Un diélectrique ne reflète qu'environ 4 % : une part métallique rend le reflet du sol lisible.
    look.floor.roughness = 0.1;
    look.floor.metallic = 0.4;
    look.counterTop.roughness = 0.05;
    look.tableTop.roughness = 0.1;
    return look;
  },

  decorate(ctx) {
    lights(ctx, 6);
    // La sonde reste pour l'environnement des surfaces dont le reflet sort de l'écran.
    ctx.probe(ctx.look.shiny, { level: 0.6, at: [0, 1.4, 0] });
  },

  post(scene, camera) {
    const ssao = new SSAO2RenderingPipeline("réalisme 6 · occlusion", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 1.2;
    ssao.totalStrength = 1.2;
    ssao.samples = 16;
    ssao.maxZ = 40;
    const ssr = new SSRRenderingPipeline("réalisme 6 · réflexions", scene, [camera], false);
    ssr.strength = 1.6;
    ssr.reflectionSpecularFalloffExponent = 2;
    ssr.thickness = 0.4;
    ssr.step = 1;
    ssr.maxSteps = 200;
    ssr.maxDistance = 30;
    ssr.roughnessFactor = 0.15;
    ssr.blurDispersionStrength = 0.03;
    ssr.enableSmoothReflections = true;
    ssr.useFresnel = true;
    ssr.attenuateScreenBorders = true;
    ssr.ssrDownsample = 1;
    const pipeline = new DefaultRenderingPipeline("réalisme 6 · photo", true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.85;
    pipeline.bloomWeight = 0.25;
    pipeline.bloomKernel = 64;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.2;
    return () => {
      pipeline.dispose();
      ssr.dispose();
      ssao.dispose();
    };
  },
};
