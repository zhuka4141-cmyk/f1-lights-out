import { apply, t } from "./i18n.mjs";

apply(document);
document.title = `${t("creditsTitle")} · LIGHTS OUT`;
const meta = document.querySelector("meta[name=description]");
if (meta) meta.setAttribute("content", t("creditsLede"));

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const local = (href, text) => `<a href="${href}">${text}</a>`;
const cc = link("https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0");
const text = {
  creditsCarBody: { name: "<strong>Blender458</strong>", sketchfab: link("https://sketchfab.com/Blender458", "Sketchfab / Blender458"), source: link("https://github.com/Pilot123321/RM-RAIN-MASTER#credits", "RM-RAIN-MASTER credits") },
  creditsCarLicense: { cc },
  creditsMusicBody: { name: "<strong>Luis Humanoide / humanoide9000</strong>", freesound: link("https://freesound.org/people/humanoide9000/sounds/769113/", "Freesound") },
  creditsMusicLicense: { cc },
  cc0Ears: { name: "<strong>Ears68</strong>", link: link("https://freesound.org/people/Ears68/sounds/181187/", "Freesound") },
  cc0Tyre: { name: "<strong>audible-edge</strong>", link: link("https://freesound.org/people/audible-edge/sounds/71741/", "Freesound") },
  cc0Burst: { name: "<strong>unfa</strong>", link: link("https://freesound.org/people/unfa/sounds/609588/", "Freesound") },
  cc0Kenney: { name: "<strong>Kenney</strong>", racing: link("https://kenney.nl/assets/racing-kit", "Racing Kit"), roads: link("https://kenney.nl/assets/city-kit-roads", "City Kit Roads"), impact: link("https://kenney.nl/assets/impact-sounds", "Impact Sounds") },
  cc0Quat: { name: "<strong>Quaternius</strong>", link: link("https://poly.pizza/m/cM3aJPU9NS", "Poly Pizza") },
  cc0Haven: { name: "<strong>Poly Haven</strong>", link: link("https://polyhaven.com/license", "Poly Haven License") },
  otherThree: { name: "<strong>Three.js 0.160.1</strong>", link: local("licenses/Three-MIT.txt", "Three-MIT.txt") },
  otherFont: { name: "<strong>Barlow Condensed ExtraBold</strong>", link: local("licenses/Barlow-OFL.txt", "Barlow-OFL.txt") },
};
for (const [id, slots] of Object.entries(text)) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = t(id, slots);
}
