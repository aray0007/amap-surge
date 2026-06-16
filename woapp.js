// Surge http-response script for China Unicom app promo cleanup.
// It only touches clear-text marketing config endpoints and leaves core data alone.

const BLOCKED_POS_CODES = new Set([
  "APP_START_PAGE",
  "HOME_BANNER_IMMERSIVE",
  "HOME_SPECIAL_BIZ",
  "APP_QQSH",
  "APP_HOME_CARD_CAI",
  "APP_HOME_CARD_LTUA",
  "HOME_JKDJ_L",
  "HOME_JKDJ_RT",
  "HOME_JKDJ_RB",
  "ZJ_CLOUD_DISK_PROMPT",
  "ZJ_CLOUD_DISK_BANNER",
  "ZJ_CLOUD_DISK_ENTRANCE",
  "HOME_JTAF_1",
  "SMART_ZNSB_1",
  "YKJ_LTYX_1",
  "YUNPAN_BANNER",
  "ZJ_FAMILY_CLOUD_CLOUD",
  "VALUE_ADDED_SERVICES_INFO"
]);

function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function finish(body) {
  $done({ body: JSON.stringify(body) });
}

const req = parseJsonSafely($request.body || "");
const resp = parseJsonSafely($response.body || "");

if (!req || !resp || !req.header || !resp.RSP) {
  $done({});
}

const apiKey = req.header.key;

if (apiKey === "QueryAppEleConfig" && Array.isArray(resp.RSP.DATA)) {
  resp.RSP.DATA = resp.RSP.DATA.filter((item) => !BLOCKED_POS_CODES.has(item?.posCode));
  finish(resp);
}

if (apiKey === "QueryHomePagePopList" && resp.RSP.DATA && typeof resp.RSP.DATA === "object") {
  resp.RSP.DATA.popMsgList = [];
  finish(resp);
}

if (apiKey === "QueryAppMktList" && resp.RSP.DATA && typeof resp.RSP.DATA === "object") {
  resp.RSP.DATA.mktList = [];
  finish(resp);
}

$done({});
