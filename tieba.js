/*
贴吧成长值/贴吧商城每日签到 + 每日点赞/评论/分享模板重放 - Quantumult X

[rewrite_local]
^https?:\/\/tieba\.baidu\.com\/mo\/q\/hybrid-main-user\/taskCenter url script-request-header tieba_growth_sign_qx.js
^https?:\/\/tieba\.baidu\.com\/mo\/q\/usergrowth\/showUserGrowth url script-response-body tieba_growth_sign_qx.js
^https?:\/\/tiebac\.baidu\.com\/c\/c\/agree\/opAgree url script-request-body tieba_growth_sign_qx.js
^https?:\/\/tiebac\.baidu\.com\/c\/c\/post\/add\?cmd=309731&format=protobuf url script-request-body tieba_growth_sign_qx.js
^https?:\/\/tiebac\.baidu\.com\/c\/c\/thread\/share\?cmd=309480&format=protobuf url script-request-body tieba_growth_sign_qx.js

[task_local]
10 8 * * * tieba_growth_sign_qx.js, tag=贴吧成长任务, img-url=https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Tieba.png, enabled=true

使用：
1. 打开任务中心一次，捕获 Cookie。
2. 手动点赞、评论、分享各一次，脚本会保存请求模板。
3. 定时任务会签到，并重放点赞/评论/分享模板。
说明：评论/分享是贴吧 protobuf 请求，脚本采用模板重放；若模板里的帖子不能重复操作，请重新手动操作一次刷新模板。
*/

const STORE_KEY = 'tieba_growth_sign_qx_config';
const TEMPLATE_KEY = 'tieba_growth_action_templates';

function done(v) { if (typeof $done !== 'undefined') $done(v || {}); }
function notify(t, s, b) { if (typeof $notify !== 'undefined') $notify(t, s || '', b || ''); }
function read(k) { return $prefs.valueForKey(k); }
function write(v, k) { return $prefs.setValueForKey(v, k); }
function parseHeaders(h) { const out = {}; Object.keys(h || {}).forEach(k => out[k.toLowerCase()] = h[k]); return out; }
function load() { try { return JSON.parse(read(STORE_KEY) || '{}'); } catch (_) { return {}; } }
function save(cfg) { cfg.updated_at = new Date().toISOString(); write(JSON.stringify(cfg), STORE_KEY); }
function loadTpl() { try { return JSON.parse(read(TEMPLATE_KEY) || '{}'); } catch (_) { return {}; } }
function saveTpl(tpl) { write(JSON.stringify(tpl), TEMPLATE_KEY); }
function req(opt) { return $task.fetch(opt).then(r => ({ status: r.statusCode, body: r.body || '' })); }
function getCookieValue(cookie, name) { const m = String(cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; }
function form(o) { return Object.keys(o).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] == null ? '' : String(o[k]))).join('&'); }
function parseForm(s) {
  const o = {};
  String(s || '').split('&').forEach(p => { if (!p) return; const i = p.indexOf('='); const k = decodeURIComponent(i >= 0 ? p.slice(0, i) : p); const v = decodeURIComponent((i >= 0 ? p.slice(i + 1) : '').replace(/\+/g, ' ')); o[k] = v; });
  return o;
}
function trimHeaders(headers) {
  const h = parseHeaders(headers || {});
  const keep = {};
  ['content-type', 'user-agent', 'cookie', 'referer'].forEach(k => { if (h[k]) keep[k] = h[k]; });
  return keep;
}
function saveFromRequest() {
  const h = parseHeaders($request.headers || {});
  const url = $request.url || '';
  const cfg = load();
  if (h.cookie) cfg.cookie = h.cookie;
  if (h['user-agent']) cfg.ua = h['user-agent'];
  if (/taskCenter|showUserGrowth/.test(url)) cfg.referer = url;
  save(cfg);

  const tpl = loadTpl();
  let name = '';
  if (/\/c\/c\/agree\/opAgree/.test(url)) name = 'like';
  else if (/\/c\/c\/post\/add/.test(url)) name = 'comment';
  else if (/\/c\/c\/thread\/share/.test(url)) name = 'share';
  if (name) {
    tpl[name] = { url, method: $request.method || 'POST', headers: trimHeaders($request.headers), body: $request.body || '', updated_at: new Date().toISOString() };
    saveTpl(tpl);
    notify('贴吧成长任务', `已捕获${name}模板`, '定时任务将尝试重放');
  } else {
    notify('贴吧成长签到', '登录参数已更新', '已捕获任务中心 Cookie，可执行定时任务');
  }
  done({});
}
function saveTbsFromResponse() {
  const cfg = load();
  try { const j = JSON.parse($response.body || '{}'); if (j.tbs) cfg.tbs = j.tbs; if (j.data && j.data.tbs) cfg.tbs = j.data.tbs; if (cfg.tbs) save(cfg); } catch (_) {}
  done({ body: $response.body });
}
async function getGrowth(cfg) {
  const cuid = getCookieValue(cfg.cookie, 'CUID') || getCookieValue(cfg.cookie, 'BAIDUCUID') || '';
  const url = 'https://tieba.baidu.com/mo/q/usergrowth/showUserGrowth?client_type=1&client_version=22.5.1.0&cuid=' + encodeURIComponent(cuid);
  const r = await req({ url, method: 'GET', headers: { Cookie: cfg.cookie, 'User-Agent': cfg.ua, Referer: cfg.referer || 'https://tieba.baidu.com/mo/q/hybrid-main-user/taskCenter/hybrid?customfullscreen=1&nonavigationbar=1&loadingSignal=1' } });
  const j = JSON.parse(r.body || '{}');
  if (j.tbs) { cfg.tbs = j.tbs; save(cfg); }
  if (String(j.no) !== '0' && j.error !== 'success') throw new Error('获取任务中心失败：' + r.body.slice(0, 200));
  return j;
}
async function commitTask(cfg, actType, extra) {
  const data = Object.assign({ act_type: actType, scene_name: 'taskCenter' }, extra || {});
  if (cfg.tbs) data.tbs = cfg.tbs;
  const headers = { Cookie: cfg.cookie, 'User-Agent': cfg.ua, Referer: 'https://tieba.baidu.com/mo/q/hybrid-main-user/taskCenter/hybrid?customfullscreen=1&nonavigationbar=1&loadingSignal=1', 'Content-Type': 'application/json;charset=UTF-8' };
  let r = await req({ url: 'https://tieba.baidu.com/mo/q/usergrowth/commitUGTaskInfo', method: 'POST', headers, body: JSON.stringify(data) });
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (_) {}
  if (r.status >= 400 || (/参数|param|invalid|error/i.test(JSON.stringify(j).slice(0, 300)) && String(j.no) !== '0' && String(j.error_code) !== '0')) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    r = await req({ url: 'https://tieba.baidu.com/mo/q/usergrowth/commitUGTaskInfo', method: 'POST', headers, body: form(data) });
    try { j = JSON.parse(r.body || '{}'); } catch (_) { j = { raw: r.body }; }
  }
  return j;
}
function flattenTasks(growth) {
  const out = [];
  (((growth.data || {}).tab_list || [])).forEach(tab => (tab.task_type_list || []).forEach(sec => (sec.task_list || []).forEach(t => out.push(Object.assign({ section: sec.task_type, tab: tab.tab_name }, t)))));
  return out;
}
function refreshLikeBody(body, cfg) {
  const p = parseForm(body);
  p._timestamp = Date.now();
  if (cfg.tbs) p.tbs = cfg.tbs;
  if (cfg.cookie) p.BDUSS = getCookieValue(cfg.cookie, 'BDUSS') || p.BDUSS;
  // sign/sig 保留模板值；贴吧目前对该请求的旧签名容忍度较高，失败时重新手动点赞刷新模板。
  return form(p);
}
async function replayTemplate(name, cfg) {
  const tpl = loadTpl()[name];
  if (!tpl) return `${name}: 未捕获模板`;
  const headers = {};
  Object.keys(tpl.headers || {}).forEach(k => headers[k] = tpl.headers[k]);
  headers.cookie = cfg.cookie || headers.cookie;
  headers['user-agent'] = cfg.ua || headers['user-agent'];
  let body = tpl.body || '';
  if (name === 'like') body = refreshLikeBody(body, cfg);
  const r = await req({ url: tpl.url, method: tpl.method || 'POST', headers, body });
  let msg = r.body.slice(0, 80);
  try { const j = JSON.parse(r.body || '{}'); msg = j.error_msg || j.msg || j.error || JSON.stringify(j.toast || j.error || j).slice(0, 80); } catch (_) {}
  return `${name}: ${r.status} ${msg}`;
}
async function doExtraTasks(cfg, growth) {
  const all = flattenTasks(growth);
  const needLike = all.some(t => ['agree', 'agree_user_profile'].indexOf(t.act_type) >= 0 && String(t.status) !== '2');
  const needComment = all.some(t => ['add_post', 'reply', 'comment'].indexOf(t.act_type) >= 0 && String(t.status) !== '2');
  const needShare = all.some(t => ['share_thread', 'share'].indexOf(t.act_type) >= 0 && String(t.status) !== '2');
  const results = [];
  if (needLike) results.push(await replayTemplate('like', cfg));
  if (needComment) results.push(await replayTemplate('comment', cfg));
  if (needShare) results.push(await replayTemplate('share', cfg));
  return results;
}
async function main() {
  const cfg = load();
  if (!cfg.cookie) throw new Error('未捕获 Cookie：请先打开贴吧 App 任务中心一次');
  const before = await getGrowth(cfg);
  const logs = [];
  const signTask = flattenTasks(before).find(x => x.act_type === 'page_sign');
  if (signTask && String(signTask.status) === '2') logs.push('签到: 今日已签');
  else {
    const res = await commitTask(cfg, 'page_sign');
    logs.push('签到: ' + (res.error || res.error_msg || res.msg || res.toast && (res.toast.text || res.toast.title) || JSON.stringify(res).slice(0, 100)));
  }
  const extra = await doExtraTasks(cfg, before);
  logs.push.apply(logs, extra);
  notify('贴吧成长任务', `执行 ${logs.length} 项`, logs.slice(0, 8).join('\n'));
}

if (typeof $request !== 'undefined' && typeof $response === 'undefined') saveFromRequest();
else if (typeof $response !== 'undefined') saveTbsFromResponse();
else main().catch(e => notify('贴吧成长任务失败', '', e.message)).finally(() => done({}));