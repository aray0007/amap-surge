/**
 * 中国移动 - 获取 Token
 *
 * 从签到页面 API 请求的 Cookie 中提取 QWHD_SESSION_TOKEN
 *
 * 配置:
 *   [Script]
 *   cmcc-token = type=http-request,pattern=wx\.10086\.cn/qwhdhub/api/mark/,requires-body=0,max-size=0,script-path=CMCC-Token.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

// 从 Cookie header 提取
function extractFromCookie(cookieStr) {
    if (!cookieStr) return null;
    const patterns = [
        /QWHD_SESSION_TOKEN=([^;\s]+)/,
        /QWHD_SESSION_TOKEN=([A-Za-z0-9]+)/,
    ];
    for (const p of patterns) {
        const m = cookieStr.match(p);
        if (m) return m[1];
    }
    return null;
}

const headers = $request.headers;
const url = $request.url;

const cookieKeys = Object.keys(headers).filter(k => k.toLowerCase() === "cookie");
const cookieVal = cookieKeys.length > 0 ? headers[cookieKeys[0]] : "";

console.log("CMCC-Token: url=" + url.substring(0, 80));
console.log("CMCC-Token: cookie-header=" + (cookieVal ? cookieVal.substring(0, 200) : "(empty)"));

const token = extractFromCookie(cookieVal);

if (token) {
    const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    $persistentStore.write(token, "cmcc_token");
    $persistentStore.write(ts, "cmcc_token_time");
    console.log("CMCC-Token: ✓ token=" + token);
    $notify("中国移动 Token", "✅ 已更新", ts);
} else {
    console.log("CMCC-Token: ✗ 未找到 QWHD_SESSION_TOKEN");
    console.log("CMCC-Token: headers=" + Object.keys(headers).join(", "));
}

$done({});