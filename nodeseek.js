/*
NodeSeek Surge 多账号自动签到脚本

功能：
1) HTTP Request 重写自动捕获/更新 Cookie，支持多账号（10 个左右没问题）
2) Cron 定时批量签到：POST https://www.nodeseek.com/api/attendance?random=true
3) 可选查询账号信息：/api/account/getInfo/{memberId}?readme=1

Surge 模块示例见同目录 NodeSeek_Checkin.sgmodule

使用方法：
- 安装模块并开启 MITM: www.nodeseek.com
- 登录/切换每个 NodeSeek 账号后，打开 https://www.nodeseek.com/board 或任意 nodeseek 页面
- 出现“获取 Cookie 成功/更新成功”通知后，即可等待定时签到
- 多账号：依次退出/切换账号再打开页面即可；脚本按 Cookie 中的 uid/用户信息去重保存

参数（可在 Surge 脚本 argument 中设置）：
random=true        签到随机鸡腿；false 固定 5 个鸡腿。默认 true
notify=true        是否通知。默认 true
info=true          签到后尝试查询用户信息。默认 true
concurrency=1      并发数，建议 1，避免风控

手动清空账号：在 Surge 脚本调试执行时传 argument: clear=true
*/

const STORE_KEY = 'nodeseek_accounts_v1';
const BASE = 'https://www.nodeseek.com';
const DEFAULT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const $ = init();
const args = parseArgs(typeof $argument === 'string' ? $argument : '');

main().catch(err => finish(`脚本异常：${err && err.message ? err.message : err}`));

async function main() {
  if (args.clear === 'true') {
    $.write([], STORE_KEY);
    return finish('已清空 NodeSeek 账号 Cookie');
  }

  if (typeof $request !== 'undefined') {
    return captureCookie();
  }

  return runCheckin();
}

async function captureCookie() {
  const headers = normalizeHeaders($request.headers || {});
  const cookie = headers.cookie || headers.Cookie || '';
  if (!cookie || !/(?:^|;\s*)(session|connect\.sid|token|__Secure|cf_clearance|uid|jwt|koa:sess)/i.test(cookie)) {
    return $done({});
  }

  const accounts = $.read(STORE_KEY, []);
  const fp = cookieFingerprint(cookie);
  let info = null;
  try {
    info = await getSelfInfo(cookie);
  } catch (_) {}

  const id = (info && (info.member_id || info.id || info.uid || info.memberId)) || extractCookieValue(cookie, 'uid') || fp;
  const name = (info && (info.member_name || info.username || info.name)) || `账号${accounts.length + 1}`;
  const now = new Date().toISOString();
  const account = {
    id: String(id),
    name: String(name),
    cookie,
    fp,
    ua: headers['user-agent'] || headers['User-Agent'] || DEFAULT_UA,
    updatedAt: now,
    memberId: String(id).match(/^\d+$/) ? String(id) : ''
  };

  const idx = accounts.findIndex(a => a.id === account.id || a.fp === account.fp || sameLoginCookie(a.cookie, cookie));
  if (idx >= 0) {
    accounts[idx] = Object.assign({}, accounts[idx], account, { createdAt: accounts[idx].createdAt || now });
  } else {
    account.createdAt = now;
    accounts.push(account);
  }
  $.write(accounts, STORE_KEY);

  const action = idx >= 0 ? '更新' : '新增';
  notify('NodeSeek Cookie', `${action}成功：${account.name}`, `当前共 ${accounts.length} 个账号`);
  return $done({});
}

async function runCheckin() {
  const accounts = $.read(STORE_KEY, []);
  if (!accounts.length) return finish('未找到账号 Cookie。请先启用模块后登录并打开 NodeSeek 页面捕获 Cookie。');

  const random = args.random !== 'false';
  const withInfo = args.info !== 'false';
  const concurrency = Math.max(1, Math.min(3, parseInt(args.concurrency || '1', 10) || 1));
  const results = [];

  await runPool(accounts, concurrency, async (acc, index) => {
    const label = acc.name || `账号${index + 1}`;
    try {
      const sign = await signIn(acc, random);
      let line = `【${label}】${formatSign(sign)}`;
      if (withInfo && acc.memberId) {
        try {
          const info = await getMemberInfo(acc, acc.memberId);
          if (info) line += `\n${formatInfo(info)}`;
        } catch (e) {
          line += `\n信息查询失败：${e.message || e}`;
        }
      }
      results[index] = line;
    } catch (e) {
      results[index] = `【${label}】签到失败：${e.message || e}`;
    }
  });

  const title = `NodeSeek 签到完成（${accounts.length} 账号）`;
  const body = results.filter(Boolean).join('\n\n');
  finish(body, title);
}

function signIn(acc, random) {
  return http({
    method: 'POST',
    url: `${BASE}/api/attendance?random=${random ? 'true' : 'false'}`,
    headers: buildHeaders(acc, `${BASE}/board`)
  }).then(r => parseJsonResponse(r));
}

function getSelfInfo(cookie) {
  return http({
    method: 'GET',
    url: `${BASE}/api/account/getInfo`,
    headers: buildHeaders({ cookie }, BASE)
  }).then(r => {
    const data = parseJsonResponse(r);
    return data.detail || data.data || data;
  });
}

function getMemberInfo(acc, memberId) {
  return http({
    method: 'GET',
    url: `${BASE}/api/account/getInfo/${memberId}?readme=1`,
    headers: buildHeaders(acc, `${BASE}/space/${memberId}`)
  }).then(r => parseJsonResponse(r));
}

function buildHeaders(acc, referer) {
  return {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9,en;q=0.8',
    'Content-Type': 'application/json',
    'Origin': BASE,
    'Referer': referer || BASE,
    'User-Agent': acc.ua || DEFAULT_UA,
    'Cookie': acc.cookie
  };
}

function parseJsonResponse(resp) {
  const status = resp.status || resp.statusCode || 0;
  const body = resp.body || '';
  if (status >= 400) throw new Error(`HTTP ${status}: ${body.slice(0, 120)}`);
  try { return JSON.parse(body); } catch (_) { throw new Error(`返回非 JSON：${body.slice(0, 120)}`); }
}

function formatSign(data) {
  if (!data || typeof data !== 'object') return String(data);
  const msg = data.message || data.msg || JSON.stringify(data);
  if (data.success === false) return msg;
  return msg || '签到成功';
}

function formatInfo(data) {
  const d = data.detail || data.data || data;
  if (!d || typeof d !== 'object') return '';
  const arr = [];
  if (d.member_name) arr.push(`用户：${d.member_name}`);
  if (d.rank !== undefined) arr.push(`等级：${d.rank}`);
  if (d.coin !== undefined) arr.push(`鸡腿：${d.coin}`);
  if (d.nPost !== undefined) arr.push(`主题：${d.nPost}`);
  if (d.nComment !== undefined) arr.push(`评论：${d.nComment}`);
  return arr.join('｜');
}

function http(opts) {
  return new Promise((resolve, reject) => {
    const cb = (err, resp, body) => {
      if (err) return reject(err);
      resp = resp || {};
      resp.body = body;
      resolve(resp);
    };
    if ((opts.method || 'GET').toUpperCase() === 'POST') $httpClient.post(opts, cb);
    else $httpClient.get(opts, cb);
  });
}

async function runPool(list, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      await worker(list[i], i);
      if (next < list.length) await wait(800 + Math.floor(Math.random() * 1200));
    }
  });
  await Promise.all(runners);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgs(str) {
  const out = {};
  String(str || '').split('&').forEach(pair => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const k = decodeURIComponent(idx >= 0 ? pair.slice(0, idx) : pair);
    const v = decodeURIComponent(idx >= 0 ? pair.slice(idx + 1) : 'true');
    out[k] = v;
  });
  return out;
}

function normalizeHeaders(h) {
  const out = {};
  Object.keys(h || {}).forEach(k => { out[k] = h[k]; out[k.toLowerCase()] = h[k]; });
  return out;
}

function extractCookieValue(cookie, key) {
  const m = String(cookie).match(new RegExp('(?:^|;\\s*)' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function sameLoginCookie(a, b) {
  const keys = ['uid', 'session', 'connect.sid', 'koa:sess', 'token'];
  return keys.some(k => extractCookieValue(a || '', k) && extractCookieValue(a || '', k) === extractCookieValue(b || '', k));
}

function cookieFingerprint(cookie) {
  const s = String(cookie).replace(/cf_clearance=[^;]+/ig, '').replace(/_ga[^=]*=[^;]+/ig, '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}

function notify(title, sub, body) {
  if (args.notify === 'false') return;
  if (typeof $notification !== 'undefined') $notification.post(title, sub || '', body || '');
}

function finish(msg, title) {
  const t = title || 'NodeSeek';
  const m = String(msg || '');
  console.log(`${t}\n${m}`);
  notify(t, '', m);
  if (typeof $done !== 'undefined') $done({});
}

function init() {
  return {
    read(key, def) {
      try {
        const v = $persistentStore.read(key);
        return v ? JSON.parse(v) : def;
      } catch (_) { return def; }
    },
    write(val, key) {
      return $persistentStore.write(JSON.stringify(val), key);
    }
  };
}