/*
广汽本田 QX 自动签到脚本
用途：Task 定时执行签到。
前提：先通过 capture.js 保存过关键凭证。
*/

const KEY_PREFIX = "gac_honda_";
const SIGN_URL = "https://gha.ghac.cn:8805/task/app/api/sign/save";
const FIND_URL = "https://gha.ghac.cn:8805/task/app/api/sign/find";

function get(key) {
  return $prefs.valueForKey(KEY_PREFIX + key) || "";
}

function buildHeaders() {
  let headers = {
    "Accept": "*/*",
    "Accept-Language": "zh-Hans-CN;q=1",
    "Connection": "keep-alive",
    "Content-Type": "application/json",
    "User-Agent": get("user_agent") || "GHA-APP-AppStore/4.1.7 (iPhone; iOS 26.5; Scale/3.00)",
    "version": get("version") || "4.1.7",
    "os": get("os") || "ios",
    "modelType": get("model_type") || "0",
    "systemVersion": get("system_version") || "26.5",
    "deviceToken": get("device_token"),
    "customerCode": get("customer_code"),
    "X-Access-Token": get("x_access_token")
  };

  let cookie = get("cookie");
  if (cookie) headers["Cookie"] = cookie;

  return headers;
}

function runFetch(url) {
  return $task.fetch({
    url: url,
    method: "GET",
    headers: buildHeaders()
  });
}

async function main() {
  if (!get("x_access_token") || !get("device_token") || !get("customer_code")) {
    $notify("广汽本田签到", "缺少凭证", "先运行 capture.js 抓一次手动签到请求");
    $done();
    return;
  }

  try {
    let resp = await runFetch(SIGN_URL);
    let text = resp.body || "";
    let title = "广汽本田签到";
    let subtitle = "";

    try {
      let obj = JSON.parse(text);
      if (obj.success === true && obj.code === 200) {
        subtitle = obj.message || "签到成功";
      } else if (String(obj.message || obj.msg || "").includes("已经签到")) {
        subtitle = obj.message || obj.msg;
      } else {
        subtitle = obj.message || obj.msg || "签到返回未知";
      }
    } catch (e) {
      subtitle = text.slice(0, 80) || "无返回内容";
    }

    try {
      let check = await runFetch(FIND_URL);
      let checkText = check.body || "";
      if (checkText) subtitle = subtitle + " | " + checkText.slice(0, 60);
    } catch (e) {
      // 查询失败不影响签到结果提示
    }

    $notify(title, subtitle, "已执行签到请求");
  } catch (err) {
    $notify("广汽本田签到", "请求失败", String(err));
  }

  $done();
}

main();
