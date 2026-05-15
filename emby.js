// ... (前面的基础函数定义保持不变: notify, setValueForKey, valueForKey 等)

// --- 在 replayAllRequests 函数中进行如下修改 ---

async function replayAllRequests() {
    // 先去重，删除重复 Host
    removeDuplicateHosts();

    let index = 1;
    let tasks = [];
    let summary = { success: 0, fail: 0, deleted: 0, total: 0 };

    // 统计有多少个任务
    while (valueForKey(generateKey(prefix, `${index}_url`))) {
        summary.total++;
        // 包装一下 replayRequest，用于收集结果
        const task = async (idx) => {
            try {
                const result = await replayRequest(idx);
                if (result === "success") summary.success++;
                else if (result === "deleted") { summary.deleted++; summary.fail++; }
                else summary.fail++;
            } catch (e) {
                summary.fail++;
            }
        };
        tasks.push(task(index));
        index++;
    }

    if (tasks.length === 0) {
        notify("Emby 重放", "注意", "未找到任何已保存的请求");
        log("未找到任何已保存的请求");
    } else {
        log(`开始执行 ${tasks.length} 个重放任务...`);
        // 等待所有异步任务完成
        await Promise.all(tasks);
        
        // 弹出汇总通知
        notify(
            "Emby 批量重放完成",
            `共执行: ${summary.total} 个任务`,
            `✅ 成功: ${summary.success}\n❌ 失败: ${summary.fail} (其中 ${summary.deleted} 个已过期删除)`
        );
    }
    
    $done();
}

// --- 稍微调整 replayRequest 函数，让它返回执行状态 ---

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
                $httpClient.post(opts, (error, response) => error ? reject(error) : resolve(response));
            } else if (isQX) {
                $task.fetch({ ...opts, method: 'POST' }).then(resolve, reject);
            }
        });

        const status = response.status || response.statusCode;

        if (status === 204 || (status >= 200 && status < 300)) {
            log(`Emby${index} - ${host} 成功 (${status})`);
            return "success";
        } else if (status === 401) {
            notify(`Emby${index}`, "登录过期 - 已删除", `Host: ${host}${getFriendlyName(host)}`);
            removeValueForKey(keyUrl);
            removeValueForKey(keyHeaders);
            removeValueForKey(keyBody);
            return "deleted";
        } else {
            log(`Emby${index} - ${host} 失败 (${status})`);
            return "fail";
        }
    } catch (e) {
        log(`Emby${index} 脚本错误: ${e}`);
        return "fail";
    }
}

// 保持入口不变
if (isRequest) {
    // ... 请求捕获逻辑 ...
} else {
    replayAllRequests();
}
