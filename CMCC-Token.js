/**
 * 中国移动 - 获取 Token
 *
 * 配置:
 *   [Script]
 *   cmcc-token = type=http-response,pattern=wx\.10086\.cn/qwhdhub/api/mark/,requires-body=0,max-size=0,script-path=CMCC-Token.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

var h = $response.headers;
var found = false;
var ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

function trySave(val) {
    if (typeof val !== "string") return false;
    var m = val.match(/QWHD_SESSION_TOKEN=([^;]+)/);
    if (m) {
        $persistentStore.write(m[1], "cmcc_token");
        $persistentStore.write(ts, "cmcc_token_time");
        console.log("CMCC: token=" + m[1].substring(0, 12));
        $notify("中国移动 Token", "✅ 已更新", ts);
        return true;
    }
    return false;
}

for (var key in h) {
    if (!h.hasOwnProperty(key)) continue;
    var val = h[key];
    console.log("CMCC: " + key + "=" + (typeof val === "string" ? val.substring(0, 100) : typeof val));
    if (trySave(val)) { found = true; }
    if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) {
            console.log("CMCC: [" + i + "] " + val[i].substring(0, 100));
            if (trySave(val[i])) { found = true; }
        }
    }
}

if (!found) {
    console.log("CMCC: ✗ 未找到 token");
    console.log("CMCC: url=" + $request.url.substring(0, 80));
    console.log("CMCC: status=" + $response.status);
}

$done({});