/*
广汽本田 Surge 合并版脚本
功能：签到 + 积分余额 + 点赞 + 分享 + 浏览

Surge 使用示例：
[Script]
广汽本田签到任务 = type=cron,cronexp="0 8 * * *",script-path=你的脚本地址,timeout=120

说明：
- 如果 X-Access-Token 过期，需要重新抓包更新 CFG。
- 当前登录态来自 2026-05-25 最新 HAR。
*/

const CFG = {
  base8081: 'https://gha.ghac.cn:8081',
  base8082: 'https://gha.ghac.cn:8082',
  base8805: 'https://gha.ghac.cn:8805',
  customerCode: 'bf656bf1d3004b65aef9a508b79b93e5',
  xAccessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZjczYzE3Zjc2YWU0YjlmYjI4ZjE4NmY1N2UxZTlkOSIsImV4cCI6MTc3OTcyNTg0MSwidXNlcklkIjoiMjAyOTYxNzYzOTU1MDcwMTU2OCIsImlhdCI6MTc3OTYzOTQ0MX0.VRokFVVqaBqiKvv2GPV5uzzWcN_vUUl1DbZtm0Af8QE',
  deviceToken: '418a3bf0bf34c653f76dfaabb70e330edc2228f08e39448de3bf6f7a7f4756a5',
  cookie: 'HWWAFSESID=5c7f088e963b6099ef; HWWAFSESTIME=1779639438391',
  version: '4.1.7',
  os: 'ios',
  userAgent: 'GHA-APP-AppStore/4.1.7 (iPhone; iOS 26.5; Scale/3.00)',
  modelType: '0',
  systemVersion: '26.5'
};

const TASKS = [
  { code: '7', name: '点赞', points: 1, count: 10, type: 'like' },
  { code: '6', name: '分享', points: 5, count: 2, type: 'share' },
  { code: '12', name: '浏览内容', points: 2, count: 5, type: 'browse' }
];

function notify(title, subtitle, message) {
  if (typeof $notification !== 'undefined') {
    $notification.post(title, subtitle || '', message || '');
  } else if (typeof $notify === 'function') {
    $notify(title, subtitle || '', message || '');
  } else {
    console.log([title, subtitle, message].filter(Boolean).join(' | '));
  }
}

function headers() {
  const h = {
    'Accept': '*/*',
    'Accept-Language': 'zh-Hans-CN;q=1',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'User-Agent': CFG.userAgent,
    'version': CFG.version,
    'os': CFG.os,
    'modelType': CFG.modelType,
    'systemVersion': CFG.systemVersion,
    'deviceToken': CFG.deviceToken,
    'customerCode': CFG.customerCode,
    'X-Access-Token': CFG.xAccessToken
  };
  if (CFG.cookie) h['Cookie'] = CFG.cookie;
  return h;
}

function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = { url, headers: headers() };
    if (body !== null && body !== undefined) {
      req.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const callback = (error, response, data) => {
      if (error) return reject(error);
      const text = data || '';
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      resolve({ raw: text, json, response });
    };

    if (method.toUpperCase() === 'GET') {
      $httpClient.get(req, callback);
    } else {
      $httpClient.post(req, callback);
    }
  });
}

function msgOf(v) {
  if (!v) return '';
  return v.message || v.msg || v.errorMsg || JSON.stringify(v).slice(0, 200);
}

function hasExpired(text) {
  return /token|登录|权限|未授权|unauthorized|invalid/i.test(text || '');
}

async function signIn() {
  const url = `${CFG.base8805}/task/app/api/sign/save`;
  const r = await httpRequest(url, 'GET');
  return msgOf(r.json) || r.raw;
}

async function queryIntegral() {
  const r = await httpRequest(`${CFG.base8081}/base/app/api/customer/statistics`, 'POST', {
    customerCode: CFG.customerCode
  });
  const data = r.json && r.json.data ? r.json.data : {};
  return data.memberIntegral || data.integral || data.points || '';
}

async function queryTaskList() {
  const r = await httpRequest(`${CFG.base8805}/task/app/api/task/completion`, 'POST', { taskType: '2' });
  return (r.json && r.json.data && r.json.data.list) ? r.json.data.list : [];
}

async function getRecommendItems() {
  const r = await httpRequest(`${CFG.base8082}/discover/app/api/circlecontent/page`, 'POST', {
    pageNo: '1', pageSize: '20', ids: '', sort: '0', themeId: '', customerCode: CFG.customerCode,
    seriesId: '', isGreat: '1', circleType: '', funLabelIds: [], timestamp: ''
  });
  const records = r.json && r.json.data && r.json.data.records ? r.json.data.records : [];
  return records.filter(x => x && x.id);
}

async function getRecommendArticles() {
  const r = await httpRequest(`${CFG.base8082.replace(':8082', ':18381')}/recommend/app/api/recommend/queryRecommendContentPage`, 'POST', {
    pageSize: '20', distinct_id: '20251127282086', pageNo: '1'
  });
  const records = r.json && r.json.data && r.json.data.records ? r.json.data.records : [];
  return records.filter(x => x && x.id);
}

async function doLike(item) {
  const r = await httpRequest(`${CFG.base8082}/discover/app/api/circlecontent/like`, 'POST', {
    id: item.id, customerCode: CFG.customerCode
  });
  return msgOf(r.json) || r.raw;
}

async function doShare(item) {
  const url = `${CFG.base8082}/discover/app/api/circlecontent/share?id=${encodeURIComponent(item.id)}&shareTypeCode=1&typeCode=4`;
  const r = await httpRequest(url, 'GET');
  return msgOf(r.json) || r.raw;
}

async function doBrowse(item) {
  const payload = { componentType: 1, innerId: item.id };
  const t1 = await httpRequest(`${CFG.base8082}/discover/app/api/dis_research_component/touchSave`, 'POST', payload);
  const t2 = await httpRequest(`${CFG.base8082}/discover/app/api/dis_research_component/isTrigger`, 'POST', payload);
  return [msgOf(t1.json) || t1.raw, msgOf(t2.json) || t2.raw].join(' / ');
}

async function runTask(task, items) {
  const logs = [];
  const total = Math.max(1, Number(task.count || 1));
  const pool = items.length ? items : [];
  let success = 0;

  for (let i = 0; i < total; i++) {
    const item = pool[i % pool.length];
    if (!item) {
      logs.push(`${task.name}: 没有可用内容`);
      break;
    }
    try {
      let res = '';
      if (task.type === 'like') res = await doLike(item);
      if (task.type === 'share') res = await doShare(item);
      if (task.type === 'browse') res = await doBrowse(item);
      logs.push(`${task.name} ${i + 1}/${total}: ${res}`);
      if (/成功|操作成功|已点赞|已经|重复|上限/.test(res)) success++;
      if (hasExpired(res)) break;
    } catch (e) {
      logs.push(`${task.name} ${i + 1}/${total}: 请求失败 ${String(e)}`);
      break;
    }
  }
  return { logs, success, total };
}

async function main() {
  const logs = [];

  try {
    const signMsg = await signIn();
    logs.push(`签到: ${signMsg}`);
  } catch (e) {
    logs.push(`签到失败: ${String(e)}`);
  }

  try {
    const integral = await queryIntegral();
    if (integral !== '') logs.push(`积分余额: ${integral}`);
  } catch (e) {
    logs.push(`积分查询失败: ${String(e)}`);
  }

  let taskList = [];
  let items = [];
  try {
    const [list, rec1, rec2] = await Promise.all([
      queryTaskList(),
      getRecommendItems(),
      getRecommendArticles()
    ]);
    taskList = list;
    items = [...rec1, ...rec2];
  } catch (e) {
    logs.push(`拉取任务/内容失败: ${String(e)}`);
  }

  for (const t of TASKS) {
    const found = taskList.find(x => String(x.id) === String(t.code) || x.taskName === t.name);
    if (found) {
      logs.push(`任务：${found.taskName}，积分 ${found.points || t.points}，次数 ${found.triggerFrequency || t.count}`);
    }
    const result = await runTask(t, items);
    logs.push(`${t.name}汇总: ${result.success}/${result.total}`);
    logs.push(...result.logs);
  }

  const summary = logs.filter(x => /签到:|积分余额|汇总|失败|过期/.test(x)).join('\n');
  const detail = logs.join('\n');
  const subtitle = /失败/.test(detail) ? '部分任务失败' : '执行完成';
  notify('广汽本田签到+任务', subtitle, (summary || detail).slice(0, 1200));
  if (typeof $done === 'function') $done();
}

main().catch(e => {
  notify('广汽本田签到+任务', '脚本异常', String(e));
  if (typeof $done === 'function') $done();
});
