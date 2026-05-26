/*
贴吧自动签到 - Quantumult X / Surge / Node.js 通用版

Quantumult X 配置示例：
[rewrite_local]
^https?:\/\/tiebac\.baidu\.com\/c\/s\/login url script-request-body tieba_auto_sign.js
^https?:\/\/tiebac\.baidu\.com\/c\/u\/follow\/list url script-request-body tieba_auto_sign.js

[task_local]
10 8 * * * tieba_auto_sign.js, tag=贴吧自动签到, img-url=https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Tieba.png, enabled=true

说明：先打开贴吧 App 一次，让脚本捕获 BDUSS 等参数；之后定时任务会自动拉取关注吧列表并逐个签到。
Node.js 手动运行：TIEBA_BDUSS='xxx' node tieba_auto_sign.js
*/

const isQX = typeof $task !== 'undefined';
const isSurge = typeof $httpClient !== 'undefined';
const isNode = typeof require === 'function' && typeof process !== 'undefined';
const STORE_KEY = 'tieba_auto_sign_config';
const APPKEY = 'tiebaclient!!!';

function done(msg) {
  if (isQX || isSurge) $done(typeof msg === 'object' ? msg : {});
}
function notify(title, sub, body) {
  if (isQX) $notify(title, sub || '', body || '');
  else if (isSurge) $notification.post(title, sub || '', body || '');
  else console.log([title, sub, body].filter(Boolean).join('\n'));
}
function getStore(k) {
  if (isQX) return $prefs.valueForKey(k);
  if (isSurge) return $persistentStore.read(k);
  return null;
}
function setStore(v, k) {
  if (isQX) return $prefs.setValueForKey(v, k);
  if (isSurge) return $persistentStore.write(v, k);
  return false;
}
function md5(s) {
  if (isNode) return require('crypto').createHash('md5').update(s).digest('hex');
  if (typeof $crypto !== 'undefined') return $crypto.md5(s).toString();
  throw new Error('当前环境缺少 MD5 能力');
}
function parseForm(s) {
  const o = {};
  String(s || '').split('&').forEach(p => {
    if (!p) return;
    const i = p.indexOf('=');
    const k = decodeURIComponent(i >= 0 ? p.slice(0, i) : p);
    const v = decodeURIComponent((i >= 0 ? p.slice(i + 1) : '').replace(/\+/g, ' '));
    o[k] = v;
  });
  return o;
}
function form(o) {
  return Object.keys(o).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] == null ? '' : String(o[k]))).join('&');
}
function signParams(p) {
  const keys = Object.keys(p).filter(k => k !== 'sign' && p[k] !== undefined && p[k] !== null).sort();
  const raw = keys.map(k => k + '=' + p[k]).join('') + APPKEY;
  return md5(raw).toUpperCase();
}
function req(opt) {
  if (isQX) return $task.fetch(opt).then(r => ({ status: r.statusCode, body: r.body || '' }));
  if (isSurge) return new Promise((resolve, reject) => {
    $httpClient[opt.method === 'POST' ? 'post' : 'get'](opt, (e, r, b) => e ? reject(e) : resolve({ status: r.status || r.statusCode, body: b || '' }));
  });
  return new Promise((resolve, reject) => {
    const u = new URL(opt.url);
    const lib = require(u.protocol === 'https:' ? 'https' : 'http');
    const r = lib.request({ method: opt.method || 'GET', hostname: u.hostname, path: u.pathname + u.search, headers: opt.headers || {} }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject); if (opt.body) r.write(opt.body); r.end();
  });
}

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(getStore(STORE_KEY) || '{}'); } catch (_) {}
  if (isNode && process.env.TIEBA_BDUSS) cfg.BDUSS = process.env.TIEBA_BDUSS;
  if (isNode && process.env.TIEBA_STOKEN) cfg.stoken = process.env.TIEBA_STOKEN;
  cfg._client_id = cfg._client_id || 'wappc_' + Date.now() + '_001';
  cfg._client_type = cfg._client_type || '1';
  cfg._client_version = cfg._client_version || '22.5.1.0';
  cfg.from = cfg.from || 'appstore';
  cfg.cuid = cfg.cuid || '';
  cfg.model = cfg.model || 'iPhone';
  cfg.net_type = cfg.net_type || '1';
  return cfg;
}

function capture() {
  const body = typeof $request !== 'undefined' ? ($request.body || '') : '';
  const p = parseForm(body);
  if (!p.BDUSS) return done({});
  const old = loadConfig();
  const keep = ['BDUSS','stoken','cuid','_client_id','_client_type','_client_version','from','model','net_type','z_id'];
  keep.forEach(k => { if (p[k]) old[k] = p[k]; });
  old.updated_at = new Date().toISOString();
  setStore(JSON.stringify(old), STORE_KEY);
  notify('贴吧签到', '登录参数已更新', '已捕获 BDUSS，可执行定时签到');
  done({});
}

async function getTbs(cfg) {
  const r = await req({ url: 'https://tieba.baidu.com/dc/common/tbs', headers: { Cookie: 'BDUSS=' + cfg.BDUSS, 'User-Agent': 'Mozilla/5.0 tieba/22.5.1.0' } });
  const j = JSON.parse(r.body);
  if (!j.is_login || !j.tbs) throw new Error('获取 tbs 失败，BDUSS 可能失效：' + r.body.slice(0, 120));
  return j.tbs;
}
function baseParams(cfg) {
  const p = {
    BDUSS: cfg.BDUSS,
    _client_id: cfg._client_id,
    _client_type: cfg._client_type,
    _client_version: cfg._client_version,
    from: cfg.from,
    model: cfg.model,
    net_type: cfg.net_type,
    timestamp: Math.floor(Date.now() / 1000)
  };
  if (cfg.cuid) p.cuid = cfg.cuid;
  if (cfg.stoken) p.stoken = cfg.stoken;
  return p;
}
async function likedForums(cfg) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const p = Object.assign(baseParams(cfg), { page_no: page, page_size: 200 });
    p.sign = signParams(p);
    const r = await req({
      method: 'POST',
      url: 'https://tiebac.baidu.com/c/f/forum/like',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 tieba/22.5.1.0' },
      body: form(p)
    });
    const j = JSON.parse(r.body || '{}');
    if (String(j.error_code || '0') !== '0') throw new Error('获取关注吧失败：' + r.body.slice(0, 200));
    const listObj = j.forum_list || [];
    const list = listObj && (listObj['non-gconforum'] || listObj.gconforum || listObj);
    const arr = Array.isArray(list) ? list : Object.keys(list || {}).reduce((a,k) => a.concat(Array.isArray(list[k]) ? list[k] : []), []);
    arr.forEach(f => all.push({ fid: f.id || f.fid || f.forum_id, kw: f.name || f.forum_name }));
    if (!arr.length || arr.length < 200) break;
  }
  const seen = {}; return all.filter(f => f.fid && f.kw && !seen[f.fid] && (seen[f.fid] = 1));
}
async function signOne(cfg, tbs, f) {
  const p = Object.assign(baseParams(cfg), { fid: f.fid, kw: f.kw, tbs });
  p.sign = signParams(p);
  const r = await req({
    method: 'POST',
    url: 'https://tiebac.baidu.com/c/c/forum/sign',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 tieba/22.5.1.0' },
    body: form(p)
  });
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (_) {}
  const code = String(j.error_code == null ? '' : j.error_code);
  return { forum: f.kw, code, msg: j.error_msg || j.error || j.msg || (code === '0' ? '成功' : r.body.slice(0, 80)) };
}
async function main() {
  const cfg = loadConfig();
  if (!cfg.BDUSS) throw new Error('未找到 BDUSS：请先按 rewrite 配置打开贴吧 App 捕获，或 Node 环境设置 TIEBA_BDUSS');
  const tbs = await getTbs(cfg);
  const forums = await likedForums(cfg);
  if (!forums.length) throw new Error('关注吧列表为空，可能接口变化或账号异常');
  const results = [];
  for (const f of forums) {
    try { results.push(await signOne(cfg, tbs, f)); }
    catch (e) { results.push({ forum: f.kw, code: 'ERR', msg: e.message }); }
  }
  const ok = results.filter(x => x.code === '0' || /已签到|already|签过/.test(x.msg)).length;
  const fail = results.length - ok;
  const detail = results.slice(0, 20).map(x => `${x.forum}: ${x.msg}`).join('\n') + (results.length > 20 ? `\n...共 ${results.length} 个吧` : '');
  notify('贴吧自动签到', `成功/已签 ${ok}，失败 ${fail}`, detail);
  if (isNode) console.log(JSON.stringify(results, null, 2));
}

if (typeof $request !== 'undefined') capture();
else main().catch(e => { notify('贴吧自动签到失败', '', e.message); if (isNode) process.exitCode = 1; }).finally(() => done({}));