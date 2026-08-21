/*
Emby 播放捕获与每日随机时间自动重放脚本 (QX 优化版)
- 每天在 9:00 ~ 21:00 之间随机抽取一个小时执行
- 执行时附带 1~25 秒的随机延迟，彻底避免固定时间特征
- 每天保证仅执行一次，完全不超 QX 脚本超时限制
*/

// =================== 自定义配置 ===================
const RANDOM_START_HOUR = 9;   // 随机最早小时 (早9点)
const RANDOM_END_HOUR = 21;    // 随机最晚小时 (晚9点)
// =================================================

const isRequest = typeof $request !== 'undefined';
const isLoon = typeof $loon !== 'undefined';
const isSurge = typeof $httpClient !== 'undefined' && !isLoon;
const isQX = typeof $notify !== 'undefined' && typeof $done !== 'undefined';

const notify = (title, subtitle, message) => {
    if (isLoon || isSurge) $notification.post(title, subtitle, message);
    if (isQX) $notify(title, subtitle, message);
};

const setValueForKey = (value, key) => {
    if (isLoon || isSurge) return $persistentStore.write(value, key);
    if (isQX) return $prefs.setValueForKey(value, key);
    return false;
};

const valueForKey = (key) => {
    if (isLoon || isSurge) return $persistentStore.read(key);
    if (isQX) return $prefs.valueForKey(key);
    return null;
};

const removeValueForKey = (key) => {
    if (isLoon || isSurge) return $persistentStore.remove(key);
    if (isQX) return $prefs.removeValueForKey(key);
    return false;
};

const generateKey = (prefix, index) => `${prefix}_${index}`;
const normalizeHeaders = (headers) => {
    const normalized = {};
    for (const key in headers) {
        normalized[key.toLowerCase()] = headers[key];
    }
    return normalized;
};

const prefix = 'bEmby_capture';

const customNames = {
  "embymv.link:8096": "peach",
  "misty.cx:443": "Misty",
  "embyplus.org:443": "纸片人",
  "581658.best:443": "飞跃彩虹²",
  "jsq.mooguu.xyz:8097": "见手青",
};

function getFriendlyName(host) {
  return customNames[host] ? `(${customNames[host]})` : "";
}

// 获取今天日期字符串 YYYY-MM-DD
function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function replayRequest(index) {
    const keyUrl = generateKey(prefix, `${index}_url`);
    const keyHeaders = generateKey(prefix, `${index}_headers`);
    const keyBody = generateKey(prefix, `${index}_body`);
    try {
        const savedUrl = valueForKey(keyUrl);
        const savedHeaders = valueForKey(keyHeaders);
        const savedBody = valueForKey(keyBody);
        if (!savedUrl || !savedHeaders) return "fail";
        const parsedHeaders = JSON.parse(savedHeaders);
        const response = await new Promise((resolve, reject) => {
            const opts = { url: savedUrl, headers: parsedHeaders, body: savedBody };
            if (isLoon || isSurge) $httpClient.post(opts, (err, resp) => err ? reject(err) : resolve(resp));
            else if (isQX) $task.fetch({ ...opts, method: 'POST' }).then(resolve, reject);
        });
        const status = response.status || response.statusCode;
        if (status === 204 || (status >= 200 && status < 300)) return "success";
        if (status === 401) {
            removeValueForKey(keyUrl); removeValueForKey(keyHeaders); removeValueForKey(keyBody);
            return "deleted";
        }
        return "fail";
    } catch (e) { return "fail"; }
}

async function replayAllRequests() {
    let index = 1;
    let tasks = [];
    let detailLogs = "";
    let summary = { success: 0, fail: 0, deleted: 0, total: 0 };

    while (valueForKey(generateKey(prefix, `${index}_url`))) {
        summary.total++;
        const currentIdx = index;
        const headers = JSON.parse(valueForKey(generateKey(prefix, `${index}_headers`)));
        const host = headers['host'];
        const name = getFriendlyName(host) || host;

        const task = async () => {
            const result = await replayRequest(currentIdx);
            if (result === "success") { summary.success++; detailLogs += `✅ ${name}\n`; }
            else if (result === "deleted") { summary.deleted++; summary.fail++; detailLogs += `🗑️ ${name} (401已删)\n`; }
            else { summary.fail++; detailLogs += `❌ ${name}\n`; }
        };
        tasks.push(task());
        index++;
    }

    if (tasks.length > 0) {
        await Promise.all(tasks);
        notify("Emby 随机重放完成", `成功: ${summary.success} | 失败: ${summary.fail}`, detailLogs);
    } else {
        notify("Emby 重放", "", "未找到已保存的请求 ❌");
    }
}

// 调度主逻辑
async function handleSchedule() {
    const today = getTodayStr();
    const lastRunDate = valueForKey('bEmby_last_run_date');

    // 1. 检查今日是否已完成
    if (lastRunDate === today) {
        console.log(`[Emby] 今日 (${today}) 已执行完毕，跳过本次巡检。`);
        $done({});
        return;
    }

    // 2. 检查或生成今日的随机目标时间 (几点)
    let targetHour = valueForKey('bEmby_target_hour');
    let targetDate = valueForKey('bEmby_target_date');

    if (!targetHour || targetDate !== today) {
        // 随机在 RANDOM_START_HOUR ~ RANDOM_END_HOUR 生成目标小时
        targetHour = Math.floor(Math.random() * (RANDOM_END_HOUR - RANDOM_START_HOUR + 1)) + RANDOM_START_HOUR;
        setValueForKey(targetHour.toString(), 'bEmby_target_hour');
        setValueForKey(today, 'bEmby_target_date');
        console.log(`[Emby] 今日 (${today}) 随机抽中执行时间点: ${targetHour}:00 左右`);
    } else {
        targetHour = parseInt(targetHour, 10);
    }

    const currentHour = new Date().getHours();
    if (currentHour < targetHour) {
        console.log(`[Emby] 当前为 ${currentHour} 点，未到预定时间 (${targetHour} 点)，等待下次巡检。`);
        $done({});
        return;
    }

    // 3. 到达目标时间，生成 1~25 秒的随机微延迟打散秒级规律
    const randomJitter = Math.floor(Math.random() * 25) + 1;
    console.log(`[Emby] 命中执行窗口，随机延迟 ${randomJitter} 秒后发起重放...`);
    await new Promise(resolve => setTimeout(resolve, randomJitter * 1000));

    // 4. 执行重放并打上完成标记
    await replayAllRequests();
    setValueForKey(today, 'bEmby_last_run_date');
    removeValueForKey('bEmby_target_hour');
    $done({});
}

// =================== 入口分支 ===================
if (isRequest) {
    // 抓包拦截阶段
    const url = $request.url;
    const headers = normalizeHeaders($request.headers);
    const host = headers['host'];
    if (!host) { 
        $done({}); 
    } else {
        let index = 1, isExist = false;
        while (valueForKey(generateKey(prefix, `${index}_url`))) {
            const savedH = valueForKey(generateKey(prefix, `${index}_headers`));
            if (savedH && JSON.parse(savedH)['host'] === host) { 
                isExist = true; 
                break; 
            }
            index++;
        }
        if (!isExist) {
            setValueForKey(url, generateKey(prefix, `${index}_url`));
            setValueForKey(JSON.stringify(headers), generateKey(prefix, `${index}_headers`));
            if ($request.body) setValueForKey($request.body, generateKey(prefix, `${index}_body`));
            notify(`Emby${index} 捕获`, "成功✅", `Host: ${host}${getFriendlyName(host)}`);
        }
        $done({});
    }
} else {
    // 定时任务重放阶段
    handleSchedule();
}
