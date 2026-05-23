/*
广汽本田 QX 合并版脚本
功能：
1) 签到
2) 日常任务：点赞 / 分享 / 浏览
3) 评论加精任务说明

说明：
- 这份脚本基于你最新 HAR 中确认的接口。
- 如果 X-Access-Token 过期，需要重新抓包更新。
- 评论加精不是普通发评论触发；当前 HAR 没抓到稳定可自动上报的精选评论接口，所以仅保留规则说明。
*/

const CFG = {
  base8082: 'https://gha.ghac.cn:8082',
  base8805: 'https://gha.ghac.cn:8805',
  customerCode: '8a18774125044bf8a5807a2f386f8613',
  xAccessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkYmE1NWQ5NzJjZDc0YThhYTVlNGJmYjRhOTRiZDA4NSIsImV4cCI6MTc3OTU4NjgzMywidXNlcklkIjoiMjAyOTYxNzYzOTU1MDcwMTU2OCIsImlhdCI6MTc3OTUwMDQzM30.Zd9p4_aNglOqtOior1rOV31Wh_lCIfPdbc6RYUAYBss',
  deviceToken: '418a3bf0bf34c653f76dfaabb70e330edc2228f08e39448de3bf6f7a7f4756a5',
  cookie: 'HWWAFSESID=0d75a241b124c6aaa23; HWWAFSESTIME=1779500429099',
  version: '4.1.7',
  os: 'ios',
  userAgent: 'GHA-APP-AppStore/4.1.7 (iPhone; iOS 26.5; Scale/3.00)',
  modelType: '0',
  systemVersion: '26.5'
};

const TASKS = [
  { code: '7', name: '点赞', points: 1, count: 10, type: 'like' },
  { code: '6', name: '分享', points: 5, count: 2, type: 'share' },
  { code: '12', name: '浏览内容', points: 2, count: 5, type: 'browse' },
  { code: '13', name: '评论加精', points: 50, count: 1, type: 'comment_featured' }
];

function notify(title, subtitle, message) {
  if (typeof $notify === 'function') $notify(title, subtitle || '', message || '');
  else console.log([title, subtitle, message].filter(Boolean).join(' | '));
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

async function fetchJson(url, method = 'GET', body = null) {
  const opt = { url, method, headers: headers() };
  if (body != null) opt.body = typeof body === 'string' ? body : JSON.stringify(body);
  const resp = await $task.fetch(opt);
  const text = resp.body || '';
  try { return { raw: text, json: JSON.parse(text) }; } catch (_) { return { raw: text, json: null }; }
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
  const body = { customerCode: CFG.customerCode };
  const r = await fetchJson(url, 'POST', body);
  return msgOf(r.json) || r.raw;
}

async function queryTaskList() {
  const r = await fetchJson(`${CFG.base8805}/task/app/api/task/completion`, 'POST', { taskType: '2' });
  return (r.json && r.json.data && r.json.data.list) ? r.json.data.list : [];
}

async function getRecommendItems() {
  const r = await fetchJson(`${CFG.base8082}/discover/app/api/circlecontent/page`, 'POST', {
    pageNo: '1', pageSize: '20', ids: '', sort: '0', themeId: '', customerCode: CFG.customerCode,
    seriesId: '', isGreat: '1', circleType: '', funLabelIds: [], timestamp: ''
  });
  const records = r.json && r.json.data && r.json.data.records ? r.json.data.records : [];
  return records.filter(x => x && x.id);
}

async function getRecommendArticles() {
  const r = await fetchJson(`${CFG.base8082.replace(':8082', ':18381')}/recommend/app/api/recommend/queryRecommendContentPage`, 'POST', {
    pageSize: '20', distinct_id: '20251127282086', pageNo: '1'
  });
  const records = r.json && r.json.data && r.json.data.records ? r.json.data.records : [];
  return records.filter(x => x && x.id);
}

async function doLike(item) {
  const r = await fetchJson(`${CFG.base8082}/discover/app/api/circlecontent/like`, 'POST', {
    id: item.id, customerCode: CFG.customerCode
  });
  return msgOf(r.json) || r.raw;
}

async function doShare(item) {
  const url = `${CFG.base8082}/discover/app/api/circlecontent/share?id=${encodeURIComponent(item.id)}&shareTypeCode=1&typeCode=4`;
  const r = await fetchJson(url, 'GET');
  return msgOf(r.json) || r.raw;
}

async function doBrowse(item) {
  const payload = { componentType: 1, innerId: item.id };
  const t1 = await fetchJson(`${CFG.base8082}/discover/app/api/dis_research_component/touchSave`, 'POST', payload);
  const t2 = await fetchJson(`${CFG.base8082}/discover/app/api/dis_research_component/isTrigger`, 'POST', payload);
  return [msgOf(t1.json) || t1.raw, msgOf(t2.json) || t2.raw].join(' / ');
}

async function runTask(task, items) {
  const logs = [];
  if (task.type === 'comment_featured') {
    logs.push('评论加精：当前 HAR 未发现可稳定自动发起的精选评论上报接口，已跳过');
    return logs;
  }
  const total = Math.max(1, Number(task.count || 1));
  const pool = items.length ? items : [];
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
      if (hasExpired(res)) break;
    } catch (e) {
      logs.push(`${task.name} ${i + 1}/${total}: 请求失败 ${String(e)}`);
      break;
    }
  }
  return logs;
}

async function main() {
  const logs = [];

  try {
    const signMsg = await signIn();
    logs.push(`签到: ${signMsg}`);
  } catch (e) {
    logs.push(`签到失败: ${String(e)}`);
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
    const lines = await runTask(t, items);
    logs.push(...lines);
  }

  const text = logs.join('\n');
  const subtitle = /失败/.test(text) ? '部分任务失败' : '执行完成';
  notify('广汽本田签到+任务', subtitle, text.slice(0, 900));
  if (typeof $done === 'function') $done();
}

main();
