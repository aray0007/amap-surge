// iios.ga Surge + BoxJS 自动签到脚本
// BoxJS 配置项：
//   iios_token       登录后的 localStorage.token，优先使用
//   iios_email       预留：邮箱
//   iios_password    预留：密码
//
// 说明：iios.ga 登录接口请求体/响应体有前端加密和签名，Surge 中直接账号密码登录不稳定。
// 当前推荐：网页登录后复制 localStorage.token 到 BoxJS 的 iios_token。

const BASE = 'https://www.iios.ga';
const API = ${BASE}/api;

const ARG = parseArgs(typeof $argument !== 'undefined' ? $argument : '');
const TOKEN = readConf('iios_token')  ARG.token  '';
const EMAIL = readConf('iios_email')  ARG.email  '';
const PASSWORD = readConf('iios_password')  ARG.password  '';

!(async () => {
  try {
    if (!TOKEN) {
      notify('配置缺失', '请在 BoxJS 填写 iios_token', '网页登录后复制 localStorage.token 到 BoxJS。账号密码登录因站点加密暂未启用。');
      return done();
    }

    const result = await checkin(TOKEN);
    notify(result.title, result.subtitle, result.message);
  } catch (e) {
    notify('脚本异常', '', String(e && e.stack || e));
  } finally {
    done();
  }
})();

async function checkin(token) {
  // 已知：登录接口为 /api/user/login，登录后 token 存 localStorage.token。
  // 签到接口目前未完全确认，保留常见候选路径。
  // 如果你用 Surge 抓到真实签到路径，把它放在数组第一位即可。
  const candidates = [
    { method: 'POST', path: '/userLog', body: {} },
    { method: 'POST', path: '/user/sign', body: {} },
    { method: 'POST', path: '/user/checkin', body: {} },
    { method: 'POST', path: '/user/checkIn', body: {} },
    { method: 'POST', path: '/user/daily', body: {} },
    { method: 'POST', path: '/user/clock', body: {} },
    { method: 'GET', path: '/user/info' },
  ];

  let last = '';
  for (const item of candidates) {
    const url = ${API}${item.path};
    const res = await http(item.method, url, token, item.body || null);
    const text = toText(res.data);
    last = ${item.method} ${item.path} HTTP ${res.status}: ${text};

    if (isCheckinSuccess(text)) {
      return { title: '签到成功', subtitle: item.path, message: trim(text, 300) };
    }
    if (/已签到|重复签到|already/i.test(text)) {
      return { title: '今日已签到', subtitle: item.path, message: trim(text, 300) };
    }
  }

  return {
    title: '未确认成功',
    subtitle: '候选接口未命中',
    message: trim(`最后响应：${last}\n建议抓取点击签到时的真实 /api 路径后告诉我。`, 350),
  };
}

function http(method, url, token, body) {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json;charset=UTF-8',
    'Origin': BASE,
    'Referer': ${BASE}/,
    'Authorization': Bearer ${token},
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  };

  return new Promise((resolve, reject) => {
    const opts = { url, headers };
    if (body !== null && body !== undefined) opts.body = JSON.stringify(body);
    const cb = (err, resp, data) => {
      if (err) return reject(err);
      resolve({ status: resp && resp.status, headers: resp && resp.headers, data: data || '' });
    };
    if (method === 'GET') $httpClient.get(opts, cb);
    else $httpClient.post(opts, cb);
  });
}

function readConf(key) {
  try {
    return ($persistentStore.read(key) || '').trim();
  } catch (_) {
    return '';
  }
}

function parseArgs(str) {
  const o = {};
  String(str || '').split('&').forEach(p => {
    if (!p) return;
    const i = p.indexOf('=');
    if (i < 0) return;
    o[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  return o;
}

function toText(data) {
  if (typeof data !== 'string') return String(data || '');
  try { return JSON.stringify(JSON.parse(data)); } catch (_) { return data; }
}

function isCheckinSuccess(text) {
  return /签到成功|打卡成功|领取成功|成功|success|积分/i.test(text) && !/失败|error|invalid|unauthorized/i.test(text);
}

function trim(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '...' : s;
}

function notify(title, subtitle, message) {
  if (typeof $notification !== 'undefined') $notification.post('iios.ga 自动签到', title  '', `${subtitle ? subtitle + '\n' : ''}${message  ''}`);
}

function done(value) {
  if (typeof $done !== 'undefined') $done(value || {});
}