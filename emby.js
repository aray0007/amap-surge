/*
Emby 播放捕获与自动重放脚本
- 支持平台: Quantumult X, Loon
- 脚本功能: 捕获播放请求并保存，支持多账号重放保号
- 配置建议: 
  [rewrite_local] ^https?:\/\/.*\/emby\/Sessions\/Playing url script-request-body emby.js
  [task_local] 0 1 * * * emby.js
*/

const isRequest = typeof $request !== 'undefined';
const isLoon = typeof $loon !== 'undefined';
const isQX = typeof $notify !== 'undefined' && typeof $done !== 'undefined';

// ======= 基础工具函数 =======
const notify = (title, subtitle, message) => {
    if (isLoon) $notification.post(title, subtitle, message);
    if (isQX) $notify(title, subtitle, message);
};

const setValueForKey = (value, key) => {
    if (isLoon) return $persistentStore.write(value, key);
    if (isQX) return $prefs.setValueForKey(value, key);
    return false;
};

const valueForKey = (key) => {
    if (isLoon) return $persistentStore.read(key);
    if (isQX) return $prefs.valueForKey(key);
    return null;
};

const removeValueForKey = (key) => {
    if (isLoon) return $persistentStore.remove(key);
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

const log = (message) => console.log(message);

const prefix = 'bEmby_capture';

// ======= Host 自定义名称映射表 =======
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

// ======= 核心逻辑：去重 =======
const removeDuplicateHosts = () => {
    const seenHosts = new Set();
    let index = 1;
    let validIndex = 1;
    while (true) {
        const keyUrl = generateKey(prefix, `${index}_url`);
        const keyHeaders = generateKey(prefix, `${index}_headers`);
        const keyBody = generateKey(prefix, `${index}_body`);

        const storedUrl = valueForKey(keyUrl);
        const storedHeaders = valueForKey(keyHeaders);
        if (!storedUrl || !storedHeaders) break;

        const headers = JSON.parse(storedHeaders);
        const host = headers['host'];

        if (host === undefined || seenHosts.has(host)) {
            removeValueForKey(keyUrl);
            removeValueForKey(keyHeaders);
            removeValueForKey(keyBody);
        } else {
            if (index !== validIndex) {
                setValueForKey(storedUrl, generateKey(prefix, `${validIndex}_url`));
                setValueForKey(storedHeaders, generateKey(prefix, `${validIndex}_headers`));
                const storedBody = valueForKey(keyBody);
                if (storedBody) setValueForKey(storedBody, generateKey(prefix, `${validIndex}_body`));
                removeValueForKey(keyUrl);
                removeValueForKey(keyHeaders);
                removeValueForKey(keyBody);
            }
            seenHosts.add(host);
            validIndex++;
        }
        index++;
    }
};

// ======= 核心逻辑：单个重放 =======
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
        const host = parsedHeaders['host'];

        const response = await new Promise((resolve, reject) => {
            const opts = { url: savedUrl, headers: parsedHeaders, body: savedBody };
            if (isLoon) {
                $httpClient.post(opts, (err, resp) => err ? reject(err) : resolve(resp));
            } else if (isQX) {
                $task.fetch({ ...opts, method: 'POST' }).then(resolve, reject);
            }
        });

        const status = response.status || response.statusCode;
        if (status === 204 || (status >= 200 && status < 300)) {
            log(`Emby${index} - ${host} 成功 (${status})`);
            return "success";
        } else if (status === 401) {
            log(`Emby${index} - ${host} 401过期，执行删除`);
            removeValueForKey(keyUrl);
            removeValueForKey(keyHeaders);
            removeValueForKey(keyBody);
            return "deleted";
        } else {
            log(`Emby${index} - ${host} 失败 (${status})`);
            return "fail";
        }
    } catch (e) {
        log(`Emby${index} 错误: ${e}`);
        return "fail";
    }
}

// ======= 核心逻辑：批量重放入口 =======
async function replayAllRequests() {
    removeDuplicateHosts();
    let index = 1;
    let tasks = [];
    let summary = { success: 0, fail: 0, deleted: 0, total: 0 };

    while (valueForKey(generateKey(prefix, `${index}_url`))) {
        summary.total++;
        const currentIdx = index;
        const task = async () => {
            const result = await replayRequest(currentIdx);
            if (result === "success") summary.success++;
            else if (result === "deleted") { summary.deleted++; summary.fail++; }
            else summary.fail++;
        };
        tasks.push(task());
        index++;
    }

    if (tasks.length === 0) {
        notify("Emby 重放", "", "未找到已保存的请求 ❌");
    } else {
        await Promise.all(tasks);
        notify(
            "Emby 批量重放完成",
            `共执行: ${summary.total} 个任务`,
            `✅ 成功: ${summary.success}\n❌ 失败: ${summary.fail} (已删除过期: ${summary.deleted})`
        );
    }
    $done();
}

// ======= 执行入口 =======
if (isRequest) {
    const url = $request.url;
    const headers = normalizeHeaders($request.headers);
    const host = headers['host'];

    if (!host) {
        notify("Emby捕获", "失败❌", "缺少Host");
        $done({});
    } else {
        let index = 1;
        let isExist = false;
        while (valueForKey(generateKey(prefix, `${index}_url`))) {
            const h = JSON.parse(valueForKey(generateKey(prefix, `${index}_headers`)))['host'];
            if (h === host) {
                isExist = true;
                break;
            }
            index++;
        }

        if (isExist) {
            notify(`Emby${index}捕获`, "已存在✅", `Host: ${host}${getFriendlyName(host)}`);
        } else {
            setValueForKey(url, generateKey(prefix, `${index}_url`));
            setValueForKey(JSON.stringify(headers), generateKey(prefix, `${index}_headers`));
            if ($request.body) setValueForKey($request.body, generateKey(prefix, `${index}_body`));
            notify(`Emby${index}捕获`, "成功✅", `Host: ${host}${getFriendlyName(host)}`);
        }
        $done({});
    }
} else {
    replayAllRequests();
}
