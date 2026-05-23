/*
广汽本田 QX 凭证抓取脚本
用途：手动打开 App 并点击签到时，保存关键请求头。
用法：加入 Quantumult X Rewrite，匹配 sign 接口。
*/

const KEY_PREFIX = "gac_honda_";

function save(key, value) {
  if (value) $prefs.setValueForKey(value, KEY_PREFIX + key);
}

let headers = ($request && $request.headers) ? $request.headers : {};

save("x_access_token", headers["X-Access-Token"] || headers["x-access-token"]);
save("device_token", headers["deviceToken"] || headers["devicetoken"]);
save("customer_code", headers["customerCode"] || headers["customercode"]);
save("version", headers["version"] || headers["Version"]);
save("os", headers["os"] || headers["OS"]);
save("user_agent", headers["User-Agent"] || headers["user-agent"]);
save("model_type", headers["modelType"] || headers["modeltype"] || headers["model-type"]);
save("system_version", headers["systemVersion"] || headers["systemversion"]);
save("cookie", headers["Cookie"] || headers["cookie"]);

let ok = ($prefs.valueForKey(KEY_PREFIX + "x_access_token") || "") && ($prefs.valueForKey(KEY_PREFIX + "customer_code") || "");

if (ok) {
  $notify("广汽本田", "凭证已保存", "可以去跑定时签到脚本了");
} else {
  $notify("广汽本田", "没有抓到完整凭证", "请在 App 里手动点一次签到，再看一次日志");
}

$done({});