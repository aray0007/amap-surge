/*
贴吧成长值/贴吧商城每日签到 - Quantumult X

[rewrite_local]
^https?:\/\/tieba\.baidu\.com\/mo\/q\/hybrid-main-user\/taskCenter url script-request-header tieba_growth_sign_qx.js
^https?:\/\/tieba\.baidu\.com\/mo\/q\/usergrowth\/showUserGrowth url script-response-body tieba_growth_sign_qx.js

[task_local]
10 8 * * * tieba_growth_sign_qx.js, tag=贴吧成长签到, img-url=https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Tieba.png, enabled=true

使用：先打开截图里的“任务中心/贴吧商城签到”页面一次，让脚本捕获 Cookie/UA；之后定时任务会自动签到。
*/

const STORE_KEY = 'tieba_growth_sign_qx_config';
const isQX = typeof $task !== 'undefined';

function done(v) { if (typeof $done !== 'undefined') $done(v || {}); }
function notify(t, s, b) { if (typeof $notify !== 'undefined') $notify(t, s || '', b || ''); }
function read(k) { return $prefs.valueForKey(k); }
function write(v, k) { return $prefs.setValueForKey(v, k); }

function parseHeaders(h) {
  const out = {};
  Object.keys(h || {}).forEach(k => out[k.toLowerCase()] = h[k]);
  return out;
}
function load() {
  try { return JSON.parse(read(STORE_KEY) || '{}'); } catch (_) { return {}; }
}
function saveFromRequest() {
  const h = parseHeaders($request.headers || {});
  const cfg = load();
  cfg.cookie = h.cookie || h.Cookie || cfg.cookie;
  cfg.ua = h['user-agent'] || cfg.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 tieba/22.5.1.0';
  cfg.referer = $request.url || cfg.referer || 'https://tieba.baidu.com/mo/q/hybrid-main-user/taskCenter/hybrid?customfullscreen=1&nonavigationbar=1&loadingSignal=1';
  cfg.updated_at = new Date().toISOString();
  write(JSON.stringify(cfg), STORE_KEY);
  notify('贴吧成长签到', '登录参数已更新', '已捕获任务中心 Cookie，可执行定时签到');
  done({});
}
function saveTbsFromResponse() {
  const cfg = load();
  try {
    const j = JSON.parse($response.body || '{}');
    if (j.tbs) cfg.tbs = j.tbs;
    if (j.data && j.data.tbs) cfg.tbs = j.data.tbs;
    if (cfg.tbs) {
      cfg.updated_at = new Date().toISOString();
      write(JSON.stringify(cfg), STORE_KEY);
    }
  } catch (_) {}
  done({ body: $response.body });
}
function req(opt) {
  return $task.fetch(opt).then(r => ({ status: r.statusCode, body: r.body || '' }));
}
function getCookieValue(cookie, name) {
  const m = String(cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
async function getGrowth(cfg) {
  const cuid = getCookieValue(cfg.cookie, 'CUID') || getCookieValue(cfg.cookie, 'BAIDUCUID') || '';
  const url = 'https://tieba.baidu.com/mo/q/usergrowth/showUserGrowth?client_type=1&client_version=22.5.1.0&cuid=' + encodeURIComponent(cuid);
  const r = await req({
    url,
    method: 'GET',
    headers: {
      Cookie: cfg.cookie,
      'User-Agent': cfg.ua,
      Referer: cfg.referer || 'https://tieba.baidu.com/mo/q/hybrid-main-user/taskCenter/hybrid?customfullscreen=1&nonavigationbar=1&loadingSignal=1'
    }
  });
  const j = JSON.parse(r.body || '{}');
  if (j.tbs) {
    cfg.tbs = j.tbs;
    write(JSON.stringify(cfg), STORE_KEY);
  }
  if (String(j.no) !== '0' && j.error !== 'success') throw new Error('获取任务中心失败：' + r.body.slice(0, 200));
  return j;
}
async function sign(cfg) {
  const url = 'https://tieba.baidu.com/mo/q/usergrowth/commitUGTaskInfo';
  const data = { act_type: 'page_sign', scene_name: 'taskCenter' };
  const headers = {
    Cookie: cfg.cookie,
    'User-Agent': cfg.ua,
    Referer: 'https://tieba.baidu.com/mo/q/hybrid-main-user/taskCenter/hybrid?customfullscreen=1&nonavigationbar=1&loadingSignal=1',
    'Content-Type': 'application/json;charset=UTF-8'
  };
  if (cfg.tbs) data.tbs = cfg.tbs;
  let r = await req({ url, method: 'POST', headers, body: JSON.stringify(data) });
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (_) {}
  // 部分 Web 接口吃表单，JSON 失败时自动换表单重试
  const bad = r.status >= 400 || /参数|param|invalid|error/i.test(JSON.stringify(j).slice(0, 300));
  if (bad && String(j.no) !== '0' && String(j.error_code) !== '0') {
    const body = Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&');
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    r = await req({ url, method: 'POST', headers, body });
    try { j = JSON.parse(r.body || '{}'); } catch (_) { j = { raw: r.body }; }
  }
  return j;
}
async function main() {
  const cfg = load();
  if (!cfg.cookie) throw new Error('未捕获 Cookie：请先打开贴吧 App 任务中心/贴吧商城签到页一次');
  const before = await getGrowth(cfg);
  const task = (((before.data || {}).tab_list || [])[0] || {}).task_type_list || [];
  let signTask = null;
  task.forEach(sec => (sec.task_list || []).forEach(x => { if (x.act_type === 'page_sign') signTask = x; }));
  if (signTask && String(signTask.status) === '2') {
    notify('贴吧成长签到', '今日已签到', `成长值 ${before.data.growth_info && before.data.growth_info.value}，贴贝 ${before.data.tmoney && before.data.tmoney.current}`);
    return;
  }
  const res = await sign(cfg);
  const msg = res.error || res.error_msg || res.msg || res.toast && (res.toast.text || res.toast.title) || JSON.stringify(res).slice(0, 120);
  notify('贴吧成长签到', '执行完成', msg);
}

if (typeof $request !== 'undefined' && typeof $response === 'undefined') saveFromRequest();
else if (typeof $response !== 'undefined') saveTbsFromResponse();
else main().catch(e => notify('贴吧成长签到失败', '', e.message)).finally(() => done({}));
