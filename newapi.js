/******************************
脚本功能：通用签到（适配所有NewAPI源码搭建的中转站）
原始版本：2026-04-19 (Quantumult X)
Surge 转换：2026-05-28
使用说明：先抓包一次保存 Cookie，再由定时任务自动签到（按域名分别保存，多站点可共用同一脚本；同站点支持多用户）。

[Script]
# 抓包保存请求头（触发 /api/user/self 时自动保存）
通用签到-抓包 = type=http-request, pattern=^https:\/\/.*\/api\/user\/self$, requires-body=0, script-path=NewAPI_MultiUser_Surge.js

# 定时签到
通用签到 = type=cron, cronexp=10 9 * * *, timeout=30, script-path=NewAPI_MultiUser_Surge.js, tag=通用签到(NewAPI)
; 如需只跑单站点（可选），替换 example.com 为实际域名
; 通用签到-单站点 = type=cron, cronexp=10 9 * * *, timeout=30, script-path=NewAPI_MultiUser_Surge.js, argument=host=example.com
; 如需只跑单站点下某个用户（可选）
; 通用签到-单用户 = type=cron, cronexp=10 9 * * *, timeout=30, script-path=NewAPI_MultiUser_Surge.js, argument=host=example.com&uid=1001
; 删除某个已保存用户（可选）
; 通用签到-删除用户 = type=cron, cronexp=10 9 * * *, timeout=30, script-path=NewAPI_MultiUser_Surge.js, argument=host=example.com&uid=1001&delete=1
; 查看当前已保存的站点和用户（可选）
; 通用签到-查看 = type=cron, cronexp=10 9 * * *, timeout=30, script-path=NewAPI_MultiUser_Surge.js, argument=list=1
; 查看某个站点下已保存的用户（可选）
; 通用签到-查看单站点 = type=cron, cronexp=10 9 * * *, timeout=30, script-path=NewAPI_MultiUser_Surge.js, argument=list=1&host=example.com

[MITM]
hostname = %APPEND% *
*******************************/

const STORE_KEY = "UniversalCheckin_Store";
const isGetHeader = typeof $request !== "undefined" && $request.headers;

const NEED_KEYS = [
  "Host",
  "User-Agent",
  "Accept",
  "Accept-Language",
  "Accept-Encoding",
  "Origin",
  "Referer",
  "Cookie",
  "new-api-user",
];

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

function getStore() {
  try {
    const raw = $persistentStore.read(STORE_KEY);
    if (!raw) return { version: 2, hosts: {} };
    const obj = safeJsonParse(raw);
    if (!obj || typeof obj !== "object") return { version: 2, hosts: {} };
    if (!obj.hosts || typeof obj.hosts !== "object") obj.hosts = {};
    if (!obj.version) obj.version = 2;
    return obj;
  } catch (e) {
    console.log("[NewAPI] Error reading store:", e);
    return { version: 2, hosts: {} };
  }
}

function saveStore(store) {
  try {
    return $persistentStore.write(JSON.stringify(store), STORE_KEY);
  } catch (e) {
    console.log("[NewAPI] Error saving store:", e);
    return false;
  }
}

function ensureHostNode(store, host) {
  if (!store.hosts[host] || typeof store.hosts[host] !== "object") {
    store.hosts[host] = {
      users: {},
    };
  }
  if (!store.hosts[host].users || typeof store.hosts[host].users !== "object") {
    store.hosts[host].users = {};
  }
}

function pickNeedHeaders(src) {
  src = src || {};
  const dst = {};
  const lowerMap = {};
  for (const k of Object.keys(src)) lowerMap[String(k).toLowerCase()] = src[k];
  const get = (name) => {
    if (src[name] !== undefined) return src[name];
    return lowerMap[String(name).toLowerCase()];
  };
  for (const k of NEED_KEYS) {
    const v = get(k);
    if (v !== undefined) dst[k] = v;
  }
  return dst;
}

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase();
}

function getHostFromRequest() {
  const h = ($request && $request.headers) || {};
  const host = h.Host || h.host;
  if (host) return normalizeHost(host);
  try {
    const u = new URL($request.url);
    return normalizeHost(u.hostname);
  } catch (_) {
    return "";
  }
}

function parseArgs(str) {
  const out = {};
  if (!str) return out;
  const s = String(str).trim();
  if (!s) return out;
  for (const part of s.split("&")) {
    const seg = part.trim();
    if (!seg) continue;
    const idx = seg.indexOf("=");
    if (idx === -1) {
      out[decodeURIComponent(seg)] = "";
    } else {
      const k = decodeURIComponent(seg.slice(0, idx));
      const v = decodeURIComponent(seg.slice(idx + 1));
      out[k] = v;
    }
  }
  return out;
}

function originFromHost(host) {
  return "https://" + host;
}

function refererFromHost(host) {
  return "https://" + host + "/console/personal";
}

function notifyTitleForHost(host) {
  return host;
}

function saveCapturedUser(host, uid, headers) {
  const store = getStore();
  ensureHostNode(store, host);
  const existed = !!store.hosts[host].users[uid];
  const oldRemark = existed ? (store.hosts[host].users[uid].remark || "") : "";

  store.hosts[host].users[uid] = {
    uid: uid,
    remark: oldRemark,
    headers: headers,
    updatedAt: Date.now(),
  };

  const ok = saveStore(store);
  return {
    ok: ok,
    existed: existed,
    hostUsersCount: Object.keys(store.hosts[host].users).length,
  };
}

function setUserRemark(store, host, uid, remark) {
  const hostNode = store.hosts[host];
  if (!hostNode || !hostNode.users || !hostNode.users[uid]) {
    return { ok: false, found: false };
  }
  hostNode.users[uid].remark = String(remark || "").trim();
  hostNode.users[uid].updatedAt = Date.now();
  return { ok: saveStore(store), found: true };
}

function deleteSavedUser(store, host, uid) {
  const hostNode = store.hosts[host];
  if (!hostNode || !hostNode.users || !hostNode.users[uid]) {
    return { ok: false, found: false, hostDeleted: false };
  }
  delete hostNode.users[uid];
  let hostDeleted = false;
  if (Object.keys(hostNode.users).length === 0) {
    delete store.hosts[host];
    hostDeleted = true;
  }
  return { ok: saveStore(store), found: true, hostDeleted: hostDeleted };
}

function getSavedHostsFromStore(store) {
  return Object.keys((store && store.hosts) || {});
}

function getRunTargets(store, args) {
  const targets = [];
  const onlyHost = String(args.host || args.hostname || "").trim();
  const onlyUid = String(args.uid || args.user || "").trim();
  const hosts = onlyHost ? [onlyHost] : getSavedHostsFromStore(store);

  for (const host of hosts) {
    const hostNode = store.hosts[host];
    if (!hostNode || !hostNode.users || typeof hostNode.users !== "object") continue;
    const userIds = onlyUid ? [onlyUid] : Object.keys(hostNode.users);
    for (const uid of userIds) {
      const userNode = hostNode.users[uid];
      if (!userNode || !userNode.headers) continue;
      targets.push({
        host: host,
        uid: uid,
        remark: userNode.remark || "",
        headers: userNode.headers,
      });
    }
  }

  return targets;
}

function formatUserLabel(host, uid, remark) {
  const title = notifyTitleForHost(host);
  if (remark) return title + " [" + remark + "/" + uid + "]";
  return title + " [" + uid + "]";
}

function buildListText(store, onlyHost) {
  const hosts = onlyHost ? [onlyHost] : getSavedHostsFromStore(store);
  const lines = [];
  let hostCount = 0;
  let userCount = 0;

  for (const host of hosts) {
    const hostNode = store.hosts[host];
    if (!hostNode || !hostNode.users || typeof hostNode.users !== "object") continue;
    const userIds = Object.keys(hostNode.users);
    if (userIds.length === 0) continue;
    hostCount += 1;
    userCount += userIds.length;
    lines.push(host + " (" + userIds.length + ")");
    for (const uid of userIds) {
      const remark = String((hostNode.users[uid] && hostNode.users[uid].remark) || "").trim();
      lines.push(remark ? "- " + uid + " (" + remark + ")" : "- " + uid);
    }
    lines.push("");
  }

  const text = lines.join("\n").trim();
  return {
    hostCount: hostCount,
    userCount: userCount,
    text: text,
  };
}

function buildNotifySummary(results) {
  const total = results.length;
  let successCount = 0;
  let alreadyCount = 0;
  let failCount = 0;
  const lines = [];

  for (const item of results) {
    if (item.kind === "success") successCount += 1;
    else if (item.kind === "already") alreadyCount += 1;
    else failCount += 1;
    lines.push(item.label + "：" + item.summary);
  }

  if (total === 1) {
    return {
      subtitle: lines[0] || "签到完成",
      body: "",
    };
  }

  const subtitle = "共 " + total + " 个账号：成功 " + successCount + " / 已签到 " + alreadyCount + " / 失败 " + failCount;
  const maxLines = 8;
  const body = lines.length > maxLines
    ? lines.slice(0, maxLines).join("\n") + "\n... 另有 " + (lines.length - maxLines) + " 个结果请查看日志"
    : lines.join("\n");

  return { subtitle: subtitle, body: body };
}

// ---- 主逻辑 ----

if (isGetHeader) {
  // 抓包模式：捕获请求头并保存
  const allHeaders = $request.headers || {};
  const host = getHostFromRequest();
  const picked = pickNeedHeaders(allHeaders);
  const uid = String(picked["new-api-user"] || "").trim();

  if (!host || !picked || !picked.Cookie || !uid) {
    console.log("[NewAPI] header capture failed:", JSON.stringify(allHeaders));
    $notification.post(
      "通用签到",
      "未抓到关键信息",
      "请在触发 /api/user/self 请求时抓包（需要包含 Cookie 和 new-api-user）。"
    );
    $done({});
    return;
  }

  const result = saveCapturedUser(host, uid, picked);
  const title = notifyTitleForHost(host);
  const actionText = result.existed ? "更新用户" : "新增用户";
  console.log("[NewAPI] " + title + " | " + actionText + " | uid=" + uid + " | users=" + result.hostUsersCount);

  $notification.post(
    result.ok ? (title + " 参数获取成功") : (title + " 参数保存失败"),
    result.ok ? (actionText + "：" + uid) : "",
    result.ok ? ("当前站点已保存 " + result.hostUsersCount + " 个用户") : "写入本地存储失败，请检查 Surge 配置。"
  );
  $done({});
} else {
  // 定时任务模式：执行签到
  const args = parseArgs(typeof $argument !== "undefined" ? $argument : "");
  const store = getStore();
  const onlyHost = normalizeHost(args.host || args.hostname || "");
  const onlyUid = String(args.uid || args.user || "").trim();
  const onlyRemark = String(args.remark || "").trim();

  // 删除用户
  if (onlyHost && onlyUid && String(args.delete || "").trim() === "1") {
    const result = deleteSavedUser(store, onlyHost, onlyUid);
    if (!result.found) {
      $notification.post("通用签到", "删除失败", "未找到站点 " + onlyHost + " 下用户 " + onlyUid + "。");
      $done();
      return;
    }
    const msg = result.hostDeleted ? "用户已删除，站点下已无剩余用户，站点记录已一并清理。" : "用户已删除。";
    console.log("[NewAPI] " + onlyHost + " | 删除用户 | uid=" + onlyUid);
    $notification.post("通用签到", onlyHost + " [" + onlyUid + "]", msg);
    $done();
    return;
  }

  // 设置备注
  if (onlyHost && onlyUid && Object.prototype.hasOwnProperty.call(args, "remark")) {
    const result = setUserRemark(store, onlyHost, onlyUid, onlyRemark);
    if (!result.found) {
      $notification.post("通用签到", "备注保存失败", "未找到站点 " + onlyHost + " 下用户 " + onlyUid + "。");
      $done();
      return;
    }
    const msg = onlyRemark ? "已设置备注：" + onlyRemark : "已清空备注";
    console.log("[NewAPI] " + onlyHost + " | 设置备注 | uid=" + onlyUid + " | remark=" + onlyRemark);
    $notification.post("通用签到", onlyHost + " [" + onlyUid + "]", msg);
    $done();
    return;
  }

  // 列出已保存账号
  if (String(args.list || "").trim() === "1") {
    const info = buildListText(store, onlyHost);
    if (!info.text) {
      const msg = onlyHost ? "站点 " + onlyHost + " 下暂无已保存用户。" : "当前暂无已保存站点和用户。";
      console.log("[NewAPI] List empty.");
      $notification.post("通用签到", "已保存账号列表", msg);
      $done();
      return;
    }
    console.log("[NewAPI] Saved targets\n" + info.text);
    $notification.post("通用签到", "已保存站点 " + info.hostCount + " 个 / 用户 " + info.userCount + " 个", info.text);
    $done();
    return;
  }

  // 签到逻辑
  const targets = getRunTargets(store, args);

  if (targets.length === 0) {
    let msg = "请先抓包保存至少一个站点的 /api/user/self 请求头。";
    if (onlyHost && onlyUid) {
      msg = "未找到站点 " + onlyHost + " 下用户 " + onlyUid + " 的已保存参数。";
    } else if (onlyHost) {
      msg = "未找到站点 " + onlyHost + " 的已保存参数。";
    }
    console.log("[NewAPI] No runnable targets found.");
    $notification.post("通用签到", "无可用目标", msg);
    $done();
    return;
  }

  function doCheckin(target) {
    return new Promise(function (resolve) {
      const host = target.host;
      const uid = target.uid;
      const savedHeaders = target.headers || {};

      const url = "https://" + host + "/api/user/checkin";
      const headers = {
        "Host": savedHeaders.Host || host,
        "Accept": savedHeaders.Accept || "application/json, text/plain, */*",
        "Accept-Language": savedHeaders["Accept-Language"] || "zh-CN,zh-Hans;q=0.9",
        "Accept-Encoding": savedHeaders["Accept-Encoding"] || "gzip, deflate, br",
        "Origin": savedHeaders.Origin || originFromHost(host),
        "Referer": savedHeaders.Referer || refererFromHost(host),
        "User-Agent": savedHeaders["User-Agent"] || "Surge",
        "Cookie": savedHeaders.Cookie || "",
        "new-api-user": savedHeaders["new-api-user"] || uid,
      };

      const title = formatUserLabel(host, uid, target.remark);

      $httpClient.post(
        {
          url: url,
          headers: headers,
          body: "",
        },
        function (error, response, data) {
          if (error) {
            console.log("[NewAPI] " + title + " | 网络错误 | " + error);
            resolve({
              kind: "fail",
              label: title,
              summary: "网络错误" + (error ? " - " + error : ""),
            });
            return;
          }

          const status = response.statusCode || response.status || 0;
          const body = data || "";

          const obj = safeJsonParse(body) || {};
          const success = Boolean(obj.success);
          const message = obj.message ? String(obj.message) : "";
          const checkinDate = (obj.data && obj.data.checkin_date) ? String(obj.data.checkin_date) : "";
          const quotaAwarded = (obj.data && obj.data.quota_awarded !== undefined) ? String(obj.data.quota_awarded) : "";
          const lowerMessage = message.toLowerCase();
          const isAlready = !success && (message.indexOf("今日已签到") !== -1 || message.indexOf("已经签到") !== -1 || lowerMessage.indexOf("already") !== -1);

          const statusText = success ? "✓成功" : isAlready ? "-已签到" : (status >= 200 && status < 300) ? "✗失败" : "✗异常(" + status + ")";
          const logMsg = "[NewAPI] " + title + " | " + statusText + (checkinDate ? " | " + checkinDate : "") + (quotaAwarded ? " | 获得:" + quotaAwarded : "") + (message ? " | " + message : "");
          console.log(logMsg.trim());

          if (status === 401 || status === 403) {
            resolve({
              kind: "fail",
              label: title,
              summary: "登录失效 HTTP " + status + (message ? " - " + message : ""),
            });
            return;
          }

          if (status >= 200 && status < 300) {
            if (success) {
              resolve({
                kind: "success",
                label: title,
                summary: quotaAwarded ? "签到成功，获得 " + quotaAwarded : "签到成功",
              });
              return;
            }
            if (isAlready) {
              resolve({
                kind: "already",
                label: title,
                summary: message || "今日已签到",
              });
              return;
            }
            resolve({
              kind: "fail",
              label: title,
              summary: message || body || "HTTP " + status,
            });
            return;
          }

          resolve({
            kind: "fail",
            label: title,
            summary: "接口异常 " + status + (message ? " - " + message : (body ? " - " + body : "")),
          });
        }
      );
    });
  }

  // 串行执行签到
  (function runAll() {
    let index = 0;
    const results = [];

    function next() {
      if (index >= targets.length) {
        const summary = buildNotifySummary(results);
        $notification.post("通用签到", summary.subtitle, summary.body);
        $done();
        return;
      }
      const current = targets[index];
      index++;
      doCheckin(current).then(function (r) {
        results.push(r);
        next();
      });
    }

    next();
  })();
}
