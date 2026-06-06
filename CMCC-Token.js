/**
 * 中国移动 - Token (debug)
 *
 * 配置:
 *   [Script]
 *   cmcc-token = type=http-response,pattern=wx\.10086\.cn/qwhdhub/api/mark/,requires-body=0,max-size=0,script-path=CMCC-Token.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

const h = $response.headers;
let found = false;

for (const key in h) {
    const val = h[key];
    if (key.toLowerCase().includes("set-cookie") || key.toLowerCase().includes("cookie")) {
        console.log("CMCC [" + key + "] = " + val.substring(0, 200));
    }
    if (typeof val === "string" && val.includes("QWHD_SESSION_TOKEN")) {
        const m = val.match(/QWHD_SESSION_TOKEN=([^;]+)/);
        if (m) {
            const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            $persistentStore.write(m[1], "cmcc_token");
            $persistentStore.write(ts, "cmcc_token_time");
            console.log("CMCC: ✓ " + m[1].substring(0, 12));
            $notify("中国移动 Token", "✅ 已更新", ts);
            found = true;
        }
    }
}

if (!found) {
    for (const key in h) {
        if (Array.isArray(h[key])) {
            console.log("CMCC [array] " + key + " len=" + h[key].length);
            h[key].forEach((v, i) => {
                console.log("CMCC [" + i + "] " + v.substring(0, 200));
                if (v.includes("QWHD_SESSION_TOKEN")) {
                    const m = v.match(/QWHD_SESSION_TOKEN=([^;]+)/);
                    if (m) {
                        const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
                        $persistentStore.write(m[1], "cmcc_token");
                        $persistentStore.write(ts, "cmcc_token_time");
                        console.log("CMCC: ✓ " + m[1].substring(0, 12));
                        $notify("中国移动 Token", "✅ 已更新", ts);
                        found = true;
                    }
                }
            });
        }
    }
}

if (!found) {
    console.log("CMCC: ✗ 未找到 token");
    console.log("CMCC: url=" + $request.url.substring(0, 80));
    console.log("CMCC: status=" + $response.status);
    console.log("CMCC: all-keys=" + Object.keys(h).join(", "));
}

$done({});