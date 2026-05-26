/*
广汽本田 Surge 合并版脚本 - 自动读取登录态版
功能：签到 + 积分余额 + 点赞 + 分享 + 浏览 5 条

Surge 使用示例：
[Script]
广汽本田签到任务 = type=cron,cronexp="0 8 * * *",script-path=你的脚本地址,timeout=180

配套登录态获取脚本：
[Script]
广汽本田获取登录态 = type=http-request,pattern=^https:\/\/gha\.ghac\.cn:(8081|8082|8805|18381)\/,script-path=登录态获取脚本地址,requires-body=0

说明：
- 不再把 X-Access-Token / Cookie / customerCode / deviceToken 写死在任务脚本里。
- 登录态从 $persistentStore 的 GHA_AUTH 读取。
- 如果提示缺少登录态或登录失效，请先打开广汽本田 App，让 Surge 抓取一次最新请求。
- 浏览任务固定浏览 5 条不同内容。
*/

const STORE_KEY = 'GHA_AUTH';

const DEFAULT_CFG = {
  base8081: 'https://gha.ghac.cn:8081',
  base8082: 'https://gha.ghac.cn:8082',
  base8805: 'https://gha.ghac.cn:8805',
  base18381: 'https://gha.ghac.cn:18381',
  version: '4.1.7',
  os: 'ios',
  userAgent: 'GHA-APP-AppStore/4.1.7',
  modelType: '0',
  systemVersion: ''
};

const TASKS = [
  { code: '7', name: '点赞', points: 1, count: 10, type: 'like' },
  { code: '6', name: '分享', points: 5, count: 2, type: 'share' },
  { code: '12', name: '浏览内容', points: 2, count: 5, type: 'browse' }
];

const BROWSE_WAIT_MS = 8000;

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function loadAuth() {
  try {
    if (typeof $persistentStore === 'undefined' || !$persistentStore) {
      return {};
    }

    const raw = $persistentStore.read(STORE_KEY);
    if (!raw) return {};

    return safeJsonParse(raw, {}) || {};
  } catch (e) {
    console.log('读取广汽本田登录态失败: ' + String(e));
    return {};
  }
}

const SAVED_AUTH = loadAuth();

const CFG = {
  ...DEFAULT_CFG,
  customerCode: SAVED_AUTH.customerCode || '',
  xAccessToken: SAVED_AUTH.xAccessToken || '',
  deviceToken: SAVED_AUTH.deviceToken || '',
  cookie: SAVED_AUTH.cookie || '',
  version: SAVED_AUTH.version || DEFAULT_CFG.version,
  os: SAVED_AUTH.os || DEFAULT_CFG.os,
  userAgent: SAVED_AUTH.userAgent || DEFAULT_CFG.userAgent,
  modelType: SAVED_AUTH.modelType || DEFAULT_CFG.modelType,
  systemVersion: SAVED_AUTH.systemVersion || DEFAULT_CFG.systemVersion,
  authUpdatedAt: SAVED_AUTH.updatedAt || ''
};

function notify(title, subtitle, message) {
  const sub = subtitle || '';
  const msg = message || '';

  try {
    if (
      typeof $notification !== 'undefined' &&
      $notification &&
      typeof $notification.post === 'function'
    ) {
      $notification.post(title, sub, msg);
    }
  } catch (e) {
    console.log('通知 $notification.post 失败: ' + String(e));
  }

  try {
    if (typeof $notify === 'function') {
      $notify(title, sub, msg);
    }
  } catch (e) {
    console.log('通知 $notify 失败: ' + String(e));
  }

  console.log([title, sub, msg].filter(Boolean).join(' | '));
}

function headers() {
  const h = {
    Accept: '*/*',
    'Accept-Language': 'zh-Hans-CN;q=1',
    Connection: 'keep-alive',
    'Content-Type': 'application/json',
    'User-Agent': CFG.userAgent,
    version: CFG.version,
    os: CFG.os,
    modelType: CFG.modelType,
    deviceToken: CFG.deviceToken,
    customerCode: CFG.customerCode,
    'X-Access-Token': CFG.xAccessToken
  };

  if (CFG.systemVersion) {
    h.systemVersion = CFG.systemVersion;
  }

  if (CFG.cookie) {
    h.Cookie = CFG.cookie;
  }

  return h;
}

function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = {
      url,
      headers: headers()
    };

    if (body !== null && body !== undefined) {
      req.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const callback = (error, response, data) => {
      if (error) {
        return reject(error);
      }

      const text = data || '';
      const json = safeJsonParse(text, null);

      resolve({
        raw: text,
        json,
        response
      });
    };

    const m = String(method || 'GET').toUpperCase();

    if (m === 'GET') {
      $httpClient.get(req, callback);
    } else {
      $httpClient.post(req, callback);
    }
  });
}

function msgOf(v) {
  if (!v) return '';
  return v.message || v.msg || v.errorMsg || v.errMsg || JSON.stringify(v).slice(0, 300);
}

function hasExpired(text) {
  return /登录已过期|登录过期|登录失效|登录状态失效|请登录|请重新登录|重新登陆|token失效|token过期|invalid token|unauthorized|未授权|无权限|鉴权失败/i.test(text || '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uniqById(arr) {
  const seen = new Set();

  return (arr || []).filter(x => {
    if (!x) return false;

    const id = x.id || x.contentId || x.articleId || x.innerId;

    if (id === undefined || id === null || id === '') {
      return false;
    }

    const sid = String(id);

    if (seen.has(sid)) {
      return false;
    }

    seen.add(sid);

    if (!x.id) {
      x.id = sid;
    }

    return true;
  });
}

function tokenExpireText(token) {
  try {
    if (!token || token.split('.').length < 2) return '未知';

    const part = token.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64));

    if (!json.exp) return '未知';

    return new Date(json.exp * 1000).toLocaleString();
  } catch (e) {
    return '解析失败';
  }
}

function maskToken(token) {
  if (!token) return '';
  if (token.length <= 18) return token.slice(0, 3) + '***';
  return token.slice(0, 10) + '...' + token.slice(-8);
}

function authReady() {
  return !!(CFG.xAccessToken && CFG.customerCode && CFG.deviceToken);
}

async function signIn() {
  const url = `${CFG.base8805}/task/app/api/sign/save`;
  const r = await httpRequest(url, 'GET');
  return msgOf(r.json) || r.raw || '无返回';
}

async function queryIntegral() {
  const r = await httpRequest(`${CFG.base8081}/base/app/api/customer/statistics`, 'POST', {
    customerCode: CFG.customerCode
  });

  const data = r.json && r.json.data ? r.json.data : {};

  return data.memberIntegral || data.integral || data.points || '';
}

async function queryTaskList() {
  const r = await httpRequest(`${CFG.base8805}/task/app/api/task/completion`, 'POST', {
    taskType: '2'
  });

  return r.json && r.json.data && r.json.data.list ? r.json.data.list : [];
}

async function getRecommendItems() {
  const r = await httpRequest(`${CFG.base8082}/discover/app/api/circlecontent/page`, 'POST', {
    pageNo: '1',
    pageSize: '20',
    ids: '',
    sort: '0',
    themeId: '',
    customerCode: CFG.customerCode,
    seriesId: '',
    isGreat: '1',
    circleType: '',
    funLabelIds: [],
    timestamp: ''
  });

  const records = r.json && r.json.data && r.json.data.records ? r.json.data.records : [];
  return records.filter(x => x && x.id);
}

async function getRecommendArticles() {
  const r = await httpRequest(`${CFG.base18381}/recommend/app/api/recommend/queryRecommendContentPage`, 'POST', {
    pageSize: '20',
    distinct_id: '20251127282086',
    pageNo: '1'
  });

  const records = r.json && r.json.data && r.json.data.records ? r.json.data.records : [];

  return records
    .filter(x => x && (x.id || x.contentId || x.articleId))
    .map(x => {
      if (!x.id) {
        x.id = x.contentId || x.articleId;
      }
      return x;
    });
}

async function doLike(item) {
  const r = await httpRequest(`${CFG.base8082}/discover/app/api/circlecontent/like`, 'POST', {
    id: item.id,
    customerCode: CFG.customerCode
  });

  return msgOf(r.json) || r.raw || '无返回';
}

async function doShare(item) {
  const url = `${CFG.base8082}/discover/app/api/circlecontent/share?id=${encodeURIComponent(item.id)}&shareTypeCode=1&typeCode=4`;

  const r = await httpRequest(url, 'GET');

  return msgOf(r.json) || r.raw || '无返回';
}

async function doBrowse(item) {
  const payload = {
    componentType: 1,
    innerId: item.id
  };

  const detailUrl = `${CFG.base8082}/discover/app/api/circlecontent/share/fetch/${encodeURIComponent(item.id)}?customerCode=${encodeURIComponent(CFG.customerCode)}`;

  await httpRequest(detailUrl, 'GET');

  const t1 = await httpRequest(`${CFG.base8082}/discover/app/api/dis_research_component/touchSave`, 'POST', payload);

  await sleep(BROWSE_WAIT_MS);

  const t2 = await httpRequest(`${CFG.base8082}/discover/app/api/dis_research_component/isTrigger`, 'POST', payload);

  return [
    msgOf(t1.json) || t1.raw || 'touchSave 无返回',
    msgOf(t2.json) || t2.raw || 'isTrigger 无返回'
  ].join(' / ');
}

async function runTask(task, items) {
  const logs = [];
  let success = 0;

  let total = Math.max(1, Number(task.count || 1));

  if (task.type === 'browse') {
    total = 5;
  }

  const pool = uniqById(items || []);

  if (!pool.length) {
    logs.push(`${task.name}: 没有可用内容`);
    return { logs, success, total };
  }

  for (let i = 0; i < total; i++) {
    let item;

    if (task.type === 'browse') {
      item = pool[i];
    } else {
      item = pool[i % pool.length];
    }

    if (!item) {
      logs.push(`${task.name} ${i + 1}/${total}: 内容不足，停止`);
      break;
    }

    try {
      let res = '';

      if (task.type === 'like') {
        res = await doLike(item);
      } else if (task.type === 'share') {
        res = await doShare(item);
      } else if (task.type === 'browse') {
        res = await doBrowse(item);
      }

      logs.push(`${task.name} ${i + 1}/${total}: ${res}`);

      if (/成功|操作成功|已点赞|已经|重复|上限|完成/.test(res)) {
        success++;
      }

      if (hasExpired(res)) {
        logs.push(`${task.name}: 疑似登录态过期，停止后续操作`);
        break;
      }
    } catch (e) {
      logs.push(`${task.name} ${i + 1}/${total}: 请求失败 ${String(e)}`);
      break;
    }
  }

  return { logs, success, total };
}

async function main() {
  const logs = [];

  logs.push(`开始执行: ${new Date().toLocaleString()}`);
  logs.push(`登录态更新时间: ${CFG.authUpdatedAt || '未知'}`);
  logs.push(`Token理论过期时间: ${tokenExpireText(CFG.xAccessToken)}`);
  logs.push(`Token: ${maskToken(CFG.xAccessToken) || '未读取到'}`);

  if (!authReady()) {
    const msg = '未读取到完整登录态，请先打开广汽本田 App，让 Surge 抓取一次 gha.ghac.cn 请求。';
    logs.push(msg);
    logs.push('需要字段: X-Access-Token / customerCode / deviceToken');

    const detail = logs.join('\n');
    console.log(detail);
    notify('广汽本田签到+任务', '缺少登录态', detail.slice(0, 1200));

    if (typeof $done === 'function') {
      $done({});
    }

    return;
  }

  try {
    const signMsg = await signIn();
    logs.push(`签到: ${signMsg}`);

    if (hasExpired(signMsg)) {
      logs.push('签到返回疑似登录态失效，请重新打开 App 刷新登录态。');
    }
  } catch (e) {
    logs.push(`签到失败: ${String(e)}`);
  }

  try {
    const integral = await queryIntegral();
    if (integral !== '') {
      logs.push(`运行前积分: ${integral}`);
    } else {
      logs.push('运行前积分: 未获取到');
    }
  } catch (e) {
    logs.push(`运行前积分查询失败: ${String(e)}`);
  }

  let taskList = [];
  let items = [];

  try {
    const result = await Promise.all([
      queryTaskList(),
      getRecommendItems(),
      getRecommendArticles()
    ]);

    taskList = result[0] || [];

    const rec1 = result[1] || [];
    const rec2 = result[2] || [];

    items = uniqById([...rec1, ...rec2]);

    logs.push(`任务列表数量: ${taskList.length}`);
    logs.push(`可用内容数量: ${items.length}`);
  } catch (e) {
    logs.push(`拉取任务/内容失败: ${String(e)}`);
  }

  for (const t of TASKS) {
    const found = taskList.find(x => {
      return String(x.id) === String(t.code) || x.taskName === t.name;
    });

    if (found) {
      logs.push(`任务: ${found.taskName}，积分 ${found.points || t.points}，次数 ${found.triggerFrequency || t.count}`);
    } else {
      logs.push(`任务: ${t.name}，未在任务列表中匹配到，仍尝试执行`);
    }

    let taskItems = items;

    if (t.type === 'browse') {
      taskItems = uniqById(items).slice(0, 5);
      logs.push(`浏览任务准备内容数: ${taskItems.length}/5`);
    }

    const result = await runTask(t, taskItems);

    logs.push(`${t.name}汇总: ${result.success}/${result.total}`);
    logs.push(...result.logs);

    if (result.logs.some(x => hasExpired(x))) {
      logs.push('检测到登录态失效，停止后续任务。');
      break;
    }
  }

  try {
    const afterIntegral = await queryIntegral();
    if (afterIntegral !== '') {
      logs.push(`运行后积分: ${afterIntegral}`);
    } else {
      logs.push('运行后积分: 未获取到');
    }
  } catch (e) {
    logs.push(`运行后积分查询失败: ${String(e)}`);
  }

  logs.push(`结束执行: ${new Date().toLocaleString()}`);

  const detail = logs.join('\n');

  console.log('========== 广汽本田任务完整日志 ==========');
  console.log(detail);
  console.log('========== 广汽本田任务日志结束 ==========');

  const summary = logs
    .filter(x => /签到:|运行前积分|运行后积分|汇总|失败|过期|失效|未授权|unauthorized|invalid|浏览任务准备内容数|Token理论过期时间|登录态更新时间/.test(x))
    .join('\n');

  const subtitle = /失败|过期|失效|未授权|unauthorized|invalid|缺少登录态/i.test(detail)
    ? '部分任务失败'
    : '执行完成';

  notify('广汽本田签到+任务', subtitle, (summary || detail).slice(0, 1200));

  if (typeof $done === 'function') {
    $done({});
  }
}

main().catch(e => {
  const err = String(e);

  console.log('脚本异常: ' + err);

  notify('广汽本田签到+任务', '脚本异常', err);

  if (typeof $done === 'function') {
    $done({});
  }
});
