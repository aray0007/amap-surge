/**
 * 中国移动 - 获取 Token
 *
 * 打开 10086 APP 签到页面时, 从 API 请求的 Cookie 中自动提取 QWHD_SESSION_TOKEN
 *
 * 配置:
 *   [Script]
 *   cmcc-token = type=http-request,pattern=^https://wx\.10086\.cn/qwhdhub/api/mark/,requires-body=0,max-size=0,script-path=CMCC-Token.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

const cookie = $request.headers["Cookie"] || $request.headers["cookie"] || "";
const m = cookie.match(/QWHD_SESSION_TOKEN=([^;]+)/);

if (m) {
    const token = m[1];
    const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    $persistentStore.write(token, "cmcc_token");
    $persistentStore.write(ts, "cmcc_token_time");
    console.log("CMCC-Token: ✓ " + token.substring(0, 12) + "...");
    $notify("中国移动 Token", "✅ 已更新", ts);
} else {
    console.log("CMCC-Token: 未找到 token");
}

$done({});