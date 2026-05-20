/*
MiraiEmby Surge 自动签到脚本

Surge Module 示例：
[Script]
MiraiEmby 自动签到 = type=cron,cronexp="10 9 * * *",wake-system=1,timeout=60,script-path=https://example.com/miraiemby_checkin.sg.js,argument=username=你的用户名&password=你的密码&checkinPath=/api/client/checkin

可选参数：
  baseUrl=https://www.miraiemby.com
  checkinPath=/api/client/checkin

说明：
  - 自动 POST /api/auth/login 获取 token
  - 真实签到接口：POST /api/client/checkin
  - token / refresh_token 会持久化到 $persistentStore
  - HTTP 409 且提示“今天已经签到过了”会按成功处理
*/

const SCRIPT_NAME = 'MiraiEmby';
const DEFAULT_BASE_URL = 'https://www.miraiemby.com';

const DEFAULT_CANDIDATES = [
  '/api/client/checkin',
  '/api/checkin',
  '/api/check-in',
  '/api/signin',
  '/api/sign-in',
  '/api/sign',
  '/api/daily/checkin',
  '/api/daily-checkin',
  '/api/attendance/checkin',
  '/api/attendance/check-in',
  '/api/user/checkin',
  '/api/users/checkin',
  '/api/user/daily-checkin',
  '/api/points/checkin',
  '/api/credits/checkin',
  '/api/reward/checkin',
  '/api/rewards/checkin',
  '/api/task/checkin',
  '/api/tasks/checkin',
  '/api/portal/checkin',
  '/api/portal/signin'
];

function parseArgs() {
  const raw = typeof $argument === 'string' ? $argument : '';
  const out = {};
  raw.split('&').forEach(pair => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const key = idx >= 0 ? pair.slice(0, idx) : pair;
    const val = idx >= 0 ? pair.slice(idx + 1) : '';
    out[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, ' '));
  });
  return out;
}

const args = parseArgs();
const BASE_URL = (args.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
const USERNAME = (args.username || '').trim();
const PASSWORD = args.password || '';
const CHECKIN_PATH = (args.checkinPath || '').trim();

const TOKEN_KEY = 'miraiemby.tokenData';

function notify(title, subtitle, body) {
  $notification.post(title, subtitle || '', body || '');
}

function readTokenData() {
  const raw = $persistentStore.read(TOKEN_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && data.token ? data : null;
  } catch (_) {
    return null;
  }
}

function saveTokenData(data) {
  $persistentStore.write(JSON.stringify(data), TOKEN_KEY);
}

function request(method, path, body, token) {
  const url = /^https?:\/\//i.test(path) ? path : BASE_URL + (path.startsWith('/') ? path : '/' + path);
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 Surge MiraiEmby-AutoCheckin/1.0',
    'Referer': BASE_URL + '/dashboard',
    'Origin': BASE_URL
  };
  let reqBody = undefined;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }
  if (token) headers['Authorization'] = 'Bearer ' + token;

  return new Promise(resolve => {
    $httpClient[method.toLowerCase()]({ url, headers, body: reqBody, timeout: 30 }, (error, response, data) => {
      const status = response ? response.status || response.statusCode : 0;
      let parsed = data;
      try { parsed = JSON.parse(data); } catch (_) {}
      resolve({ error, status, body: parsed, raw: data, path, method });
    });
  });
}

async function login() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('缺少 username/password，请在 Surge argument 中填写。');
  }
  const res = await request('POST', '/api/auth/login', { username: USERNAME, password: PASSWORD });
  if (res.status !== 200 || !res.body || !res.body.token) {
    throw new Error('登录失败 HTTP ' + res.status + ': ' + stringifyBody(res.body || res.raw || res.error));
  }
  const tokenData = {
    token: res.body.token || '',
    refresh_token: res.body.refresh_token || '',
    role: res.body.role || 'user',
    auth_type: res.body.auth_type || 'portal',
    saved_at: Date.now()
  };
  saveTokenData(tokenData);
  console.log(`[${SCRIPT_NAME}] 登录成功，token 已缓存`);
  return tokenData;
}

async function refreshToken(tokenData) {
  if (!tokenData || !tokenData.refresh_token) return null;
  const res = await request('POST', '/api/auth/refresh', { refresh_token: tokenData.refresh_token });
  if (res.status === 200 && res.body && res.body.token) {
    const next = {
      ...tokenData,
      token: res.body.token || '',
      refresh_token: res.body.refresh_token || tokenData.refresh_token,
      role: res.body.role || tokenData.role || 'user',
      auth_type: res.body.auth_type || tokenData.auth_type || 'portal',
      saved_at: Date.now()
    };
    saveTokenData(next);
    console.log(`[${SCRIPT_NAME}] token 刷新成功`);
    return next;
  }
  return null;
}

function isAuthError(res) {
  if (!res || res.status !== 401) return false;
  const text = stringifyBody(res.body || res.raw || '');
  return /Token|认证|登录|AUTH_|Unauthorized|过期/i.test(text);
}

function candidatePaths() {
  if (CHECKIN_PATH) return [CHECKIN_PATH.startsWith('/') ? CHECKIN_PATH : '/api/' + CHECKIN_PATH.replace(/^\/+/, '')];
  return DEFAULT_CANDIDATES;
}

async function tryCheckin(token) {
  const tried = [];
  for (const path of candidatePaths()) {
    for (const method of ['POST', 'GET']) {
      const res = method === 'POST'
        ? await request(method, path, {}, token)
        : await request(method, path, null, token);
      console.log(`[${SCRIPT_NAME}] ${method} ${path} -> ${res.status}`);
      if (res.status === 404 || res.status === 405) {
        tried.push(`${method} ${path} ${res.status}`);
        continue;
      }
      return res;
    }
  }
  return { status: 404, body: { message: '未找到可用签到接口', tried } };
}

function stringifyBody(body) {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  try { return JSON.stringify(body); } catch (_) { return String(body); }
}

function extractMessage(res) {
  const body = res && res.body;
  if (body && typeof body === 'object') {
    return body.message || body.error || body.msg || body.detail || stringifyBody(body);
  }
  return stringifyBody(body || (res && res.raw) || '');
}

(async () => {
  try {
    let tokenData = readTokenData();
    if (!tokenData) tokenData = await login();

    let res = await tryCheckin(tokenData.token);

    if (isAuthError(res)) {
      tokenData = await refreshToken(tokenData) || await login();
      res = await tryCheckin(tokenData.token);
    }

    const msg = extractMessage(res);
    if (res.status >= 200 && res.status < 300) {
      notify('MiraiEmby 签到成功', `HTTP ${res.status}`, msg);
      console.log(`[${SCRIPT_NAME}] 签到成功：${msg}`);
    } else if (res.status === 409 && /今天已经签到过了/.test(msg)) {
      notify('MiraiEmby 已签到', `HTTP ${res.status}`, msg);
      console.log(`[${SCRIPT_NAME}] 已签到：${msg}`);
    } else {
      const hint = res.status === 404 && !CHECKIN_PATH
        ? '默认候选接口均不可用，请抓包获取签到接口后设置 checkinPath。'
        : msg;
      notify('MiraiEmby 签到失败', `HTTP ${res.status}`, hint);
      console.log(`[${SCRIPT_NAME}] 签到失败：${hint}`);
    }
  } catch (e) {
    notify('MiraiEmby 签到异常', '', e.message || String(e));
    console.log(`[${SCRIPT_NAME}] 异常：${e.stack || e.message || e}`);
  } finally {
    $done();
  }
})();