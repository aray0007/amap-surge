// PingMe 青龙版
// 环境变量：PINGME_URLS、PINGME_HEADERS
// 多账号用换行分隔；PINGME_HEADERS 可填 JSON 或抓包 headers JSON

const crypto = require("crypto");

const SECRET = "0fOiukQq7jXZV2GRi9LGlO";
const MAX_VIDEO = Number(process.env.PINGME_MAX_VIDEO || 5);
const VIDEO_DELAY = Number(process.env.PINGME_VIDEO_DELAY || 8000);

const urls = (process.env.PINGME_URLS || "")
  .split(/\n/)
  .map(x => x.trim())
  .filter(Boolean);

const headersList = (process.env.PINGME_HEADERS || "")
  .split(/\n(?=\{)/)
  .map(x => x.trim())
  .filter(Boolean);

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getUTCSignDate() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function parseRawQuery(url) {
  const u = new URL(url);
  const obj = {};
  for (const [k, v] of u.searchParams.entries()) obj[k] = v;
  return obj;
}

function buildSignedParams(raw) {
  const params = {};
  for (const k of Object.keys(raw)) {
    if (k !== "sign" && k !== "signDate") params[k] = raw[k];
  }
  params.signDate = getUTCSignDate();
  const base = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  params.sign = md5(base + SECRET);
  return params;
}

function buildUrl(path, raw) {
  const params = buildSignedParams(raw);
  const qs = Object.keys(params)
    .map(k => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  return `https://api.pingmeapp.net/app/${path}?${qs}`;
}

function cleanHeaders(h = {}) {
  const out = { ...h };
  for (const k of Object.keys(out)) {
    if (
      k.toLowerCase() === "content-length" ||
      k.startsWith(":")
    ) delete out[k];
  }
  out.Host = "api.pingmeapp.net";
  out.Accept = out.Accept || "application/json";
  return out;
}

async function api(path, raw, headers) {
  const res = await fetch(buildUrl(path, raw), {
    method: "GET",
    headers,
  });
  return await res.json();
}

async function runOne(i, url, headersRaw) {
  const raw = parseRawQuery(url);
  const headers = cleanHeaders(headersRaw ? JSON.parse(headersRaw) : {});
  const msg = [`账号 ${i + 1}`];

  try {
    let d = await api("queryBalanceAndBonus", raw, headers);
    msg.push(d.retcode === 0 ? `余额：${d.result.balance} Coins` : `查询失败：${d.retmsg}`);

    d = await api("checkIn", raw, headers);
    msg.push(d.retcode === 0 ? `签到：${d.result?.bonusHint || d.retmsg || "成功"}` : `签到失败：${d.retmsg}`);

    for (let n = 1; n <= MAX_VIDEO; n++) {
      await sleep(n === 1 ? 1500 : VIDEO_DELAY);
      d = await api("videoBonus", raw, headers);
      if (d.retcode === 0) msg.push(`视频${n}：+${d.result?.bonus || "?"} Coins`);
      else {
        msg.push(`视频${n}：${d.retmsg}`);
        break;
      }
    }

    d = await api("queryBalanceAndBonus", raw, headers);
    if (d.retcode === 0) msg.push(`最新余额：${d.result.balance} Coins`);
  } catch (e) {
    msg.push(`异常：${e.message || e}`);
  }

  console.log(msg.join("\n"));
}

(async () => {
  if (!urls.length) {
    console.log("未配置 PINGME_URLS");
    return;
  }

  for (let i = 0; i < urls.length; i++) {
    await runOne(i, urls[i], headersList[i] || headersList[0] || "{}");
    if (i < urls.length - 1) await sleep(3500);
  }
})();