/*
广汽本田 QX 本地自动签到脚本
说明：本文件已从你的最新 HAR 中更新本地凭证，不需要 capture.js，不需要 MitM。
注意：X-Access-Token 可能会过期，过期后需要重新抓包或重新生成。
更新时间：2026-05-23 08:25
*/

const SIGN_URL = "https://gha.ghac.cn:8805/task/app/api/sign/save";
const FIND_URL = "https://gha.ghac.cn:8805/task/app/api/sign/find";

const GAC_HONDA = {
  xAccessToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIzM2JiMWM2ZWRhNjM0ZmUyODk0MjQzZDMwM2Q0ZDJiZiIsImV4cCI6MTc3OTU4MjI0OCwidXNlcklkIjoiMjAyOTYxNzYzOTU1MDcwMTU2OCIsImlhdCI6MTc3OTQ5NTg0OH0.-iFhIrsRdEu6QBoxTCGa1cFLF5AaE3BfFTVGAw9JkUc",
  deviceToken: "418a3bf0bf34c653f76dfaabb70e330edc2228f08e39448de3bf6f7a7f4756a5",
  customerCode: "86ce830b00534c7d8a39f765236c2bda",
  cookie: "HWWAFSESID=4ec93157661c735bd22; HWWAFSESTIME=1779495844323",
  version: "4.1.7",
  os: "ios",
  userAgent: "GHA-APP-AppStore/4.1.7 (iPhone; iOS 26.5; Scale/3.00)",
  modelType: "0",
  systemVersion: "26.5"
};

function notify(title, subtitle, message) {
  $notify(title, subtitle || "", message || "");
}

function buildHeaders() {
  let headers = {
    "Accept": "*/*",
    "Accept-Language": "zh-Hans-CN;q=1",
    "Connection": "keep-alive",
    "Content-Type": "application/json",
    "User-Agent": GAC_HONDA.userAgent,
    "version": GAC_HONDA.version,
    "os": GAC_HONDA.os,
    "modelType": GAC_HONDA.modelType,
    "systemVersion": GAC_HONDA.systemVersion,
    "deviceToken": GAC_HONDA.deviceToken,
    "customerCode": GAC_HONDA.customerCode,
    "X-Access-Token": GAC_HONDA.xAccessToken
  };
  if (GAC_HONDA.cookie) headers["Cookie"] = GAC_HONDA.cookie;
  return headers;
}

async function requestGet(url) {
  return await $task.fetch({ url, method: "GET", headers: buildHeaders() });
}

function parseMessage(text) {
  if (!text) return "无返回内容";
  try {
    let obj = JSON.parse(text);
    return obj.message || obj.msg || JSON.stringify(obj);
  } catch (e) {
    return String(text).slice(0, 120);
  }
}

async function main() {
  try {
    let resp = await requestGet(SIGN_URL);
    let body = resp.body || "";
    let msg = parseMessage(body);

    if (body.includes("签到成功")) {
      notify("广汽本田签到", "签到成功", msg);
    } else if (body.includes("已经签到")) {
      notify("广汽本田签到", "今天已经签到", msg);
    } else if (body.includes("token") || body.includes("登录") || body.includes("权限") || body.includes("未授权")) {
      notify("广汽本田签到", "可能凭证过期", msg);
    } else {
      notify("广汽本田签到", "执行完成", msg);
    }

    try { await requestGet(FIND_URL); } catch (e) {}
  } catch (err) {
    notify("广汽本田签到", "请求失败", String(err));
  }
  $done();
}

main();
