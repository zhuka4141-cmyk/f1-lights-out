import assert from "node:assert/strict";
import test from "node:test";
import { catalogs, matchLocale, translate } from "../src/i18n.mjs";

test("browser language selects the closest installed catalog", () => {
  assert.equal(matchLocale(["zh-CN", "en-US"]), "zh");
  assert.equal(matchLocale(["zh-Hans"]), "zh");
  assert.equal(matchLocale(["zh-TW"]), "zh-Hant");
  assert.equal(matchLocale(["zh-HK"]), "zh-Hant");
  assert.equal(matchLocale(["zh-Hant-HK"]), "zh-Hant");
  assert.equal(matchLocale(["en-GB"]), "en");
  assert.equal(matchLocale(["ja"]), "ja");
  assert.equal(matchLocale(["ko-KR"]), "ko");
  assert.equal(matchLocale(["es-MX", "en"]), "es");
  assert.equal(matchLocale(["fr-FR"]), "fr");
  assert.equal(matchLocale(["de-DE"]), "de");
  assert.equal(matchLocale(["sv-SE"]), "en");
  assert.equal(matchLocale([]), "zh");
});

test("every installed language keeps the game placeholders", () => {
  for (const language of Object.keys(catalogs)) {
    assert.match(translate(language, "reactionLive", { ms: 120 }), /120/);
    assert.match(translate(language, "validDesc", { gap: 250 }), /250/);
    assert.match(translate(language, "startNote"), /<br>/);
    assert.equal(translate(language, "startGame").length > 0, true);
  }
});
