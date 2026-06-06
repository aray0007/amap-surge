/**
 * 中国移动 - 获取 Token
 *
 * 从签到页面 API 响应的 Set-Cookie 中提取 QWHD_SESSION_TOKEN
 *
 * 配置:
 *   [Script]
 *   cmcc-token = type=http-response,pattern=wx\.10086\.cn/qwhdhub/api/mark/,requires-body=0,max-size=0,script-path=CMCC-Token.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

const headers = $response.headers;
const setCookie = headers["Set-Cookie"] || headers["set-cookie"] || "";

console.log("CMCC-Token: set-cookie=" + (setCookie ? setCookie.substring(0, 150) : "(empty)"));

const m = setCookie.match(/QWHD_SESSION_TOKEN=([^;]+)/);

if (m) {
    const token = m[1];
    const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    $persistentStore.write(token, "cmcc_token");
    $persistentStore.write(ts, "cmcc_token_time");
    console.log("CMCC-Token: ✓ " + token.substring(0, 12) + "...");
    $notify("中国移动 Token", "✅ 已更新", ts);
} else {
    console.log("CMCC-Token: ✗ 未找到");
    // 打印所有 response header keys
    console.log("CMCC-Token: resp-keys=" + Object.keys(headers).join(", "));
}

$done({});