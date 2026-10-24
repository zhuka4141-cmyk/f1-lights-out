import zh from "./locales/zh.mjs";
import zhHant from "./locales/zh-Hant.mjs";
import en from "./locales/en.mjs";
import { ja } from "./locales/ja.mjs";
import { ko } from "./locales/ko.mjs";
import { es } from "./locales/es.mjs";
import { fr, de } from "./locales/fr-de.mjs";

export const catalogs = { zh, "zh-Hant": zhHant, en, ja, ko, es, fr, de };

export function matchLocale(languages = []) {
  const list = languages.length ? languages : ["zh-CN"];
  for (const raw of list) {
    const tag = String(raw || "").trim().replace(/_/g, "-");
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (lower === "zh" || lower.startsWith("zh-")) {
      return /(^|-)(hant|tw|hk|mo)(-|$)/.test(lower) ? "zh-Hant" : "zh";
    }
    const base = lower.split("-")[0];
    if (catalogs[base]) return base;
  }
  return "en";
}

const browserLanguages = typeof navigator === "undefined"
  ? ["zh-CN"]
  : (navigator.languages?.length ? navigator.languages : [navigator.language || "zh-CN"]);
export const locale = matchLocale(browserLanguages);

export function translate(language, key, vars = {}) {
  const pack = catalogs[language] || catalogs.en;
  let text = pack[key] ?? catalogs.en[key] ?? catalogs.zh[key] ?? key;
  for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

export const t = (key, vars) => translate(locale, key, vars);

const knownErrors = new Map([
  ["请输入名字，最多 20 个字。 / Enter a name, up to 20 characters.", "nameInvalid"],
  ["请输入名字，最多 20 个字。", "nameInvalid"],
  ["网络连接失败，请稍后重试。", "netFail"],
  ["在线排行榜暂时不可用，请稍后重试。", "boardDown"],
  ["排行榜数据暂时无法读取。", "boardRead"],
  ["本轮已经记录。", "alreadySaved"],
  ["只有有效刹停才能上榜。", "onlyValid"],
  ["请使用本轮开始时的名字记录成绩。", "sameName"],
  ["起步时未连上排行榜，本轮无法提交，请联网后重新挑战。", "noTicket"],
  ["请从游戏页面提交成绩。", "pageSubmit"],
  ["操作记录过大，请重新挑战。", "recordTooBig"],
  ["请求格式无效。", "badFormat"],
  ["比赛记录格式无效。", "badRecord"],
  ["在线排行榜暂时无法连接，请稍后重试。", "boardOffline"],
  ["请求方法无效。", "badMethod"],
  ["比赛计时无效，请重新挑战。", "badClock"],
  ["本轮上榜凭证已失效，请重新挑战。", "ticketExpired"],
  ["比赛记录不完整，无法上榜，请重新挑战。", "recordIncomplete"],
  ["比赛操作记录无效，请重新挑战。", "recordInvalid"],
  ["比赛结束后仍有操作，无法上榜。", "inputAfterFinish"],
  ["只有冲线并在路障前正常刹停才能上榜。", "onlyCleanStop"],
  ["成绩与比赛过程不一致，请重新挑战。", "proofMismatch"],
  ["这条成绩已由管理员移除。", "removedByAdmin"],
]);

export function localizeError(message) {
  const key = knownErrors.get(String(message || ""));
  return key ? t(key) : String(message || "");
}

export function apply(root = document) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  const title = document.querySelector("title");
  document.title = title?.getAttribute("data-i18n") ? t(title.getAttribute("data-i18n")) : document.title;
  root.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = t(element.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-html]").forEach(element => {
    element.innerHTML = t(element.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-attr]").forEach(element => {
    for (const pair of element.getAttribute("data-i18n-attr").split(";")) {
      const index = pair.indexOf(":");
      if (index > 0) element.setAttribute(pair.slice(0, index), t(pair.slice(index + 1)));
    }
  });
}
