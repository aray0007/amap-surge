/**
 * 中国移动 - 获取 / 刷新 Token
 *
 * 两种触发方式:
 *   1. http-request: 打开 10086 APP 签到页面时自动捕获 SSO 并获取 token
 *   2. cron: 用已保存的 SSO 凭证定时刷新 token
 *
 * 配置:
 *   [Script]
 *   cmcc-token-req = type=http-request,pattern=^https://wx\.10086\.cn/qwhdsso/appTokenLogin,requires-body=1,max-size=0,script-path=cmcc_get_token.js
 *   cmcc-token-cron = type=cron,cronexp="55 7 * * *",script-path=cmcc_get_token.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148/wkwebview leadeon/12.1.1/CMCCIT";

function fetchToken(ssoToken, province, city, checkId) {
    $httpClient.post({
        url: "https://wx.10086.cn/qwhdsso/appTokenLogin",
        headers: { "Content-Type": "application/json;charset=UTF-8", "User-Agent": UA },
        body: JSON.stringify({
            jwtToken: null, token: ssoToken,
            provinceCode: province, cityCode: city,
            userCheckId: checkId, carrierOperator: "002",
            appVersionCode: "12.1.1", took: Math.floor(Math.random() * 200) + 50
        })
    }, (err, resp, data) => {
        if (err) { console.log("CMCC: appTokenLogin 失败 - " + err); $done({}); return; }
        try {
            const r = JSON.parse(data);
            if (r.code !== "SUCCESS") {
                console.log("CMCC: 登录失败 - " + r.msg);
                $notify("中国移动 Token", "❌ 登录失败", r.msg);
                $done({}); return;
            }
            // 加载页面获取 QWHD_SESSION_TOKEN
            $httpClient.get({
                url: r.data.url,
                headers: { "User-Agent": UA, "Origin": "https://wx.10086.cn" }
            }, (e2, h2, b2) => {
                const sc = (h2.headers["set-cookie"] || h2.headers["Set-Cookie"] || "");
                const m = sc.match(/QWHD_SESSION_TOKEN=([^;]+)/);
                if (m) {
                    const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
                    $persistentStore.write(m[1], "cmcc_token");
                    $persistentStore.write(ts, "cmcc_token_time");
                    console.log("CMCC: ✓ Token 已获取 - " + m[1].substring(0, 10) + "...");
                    $notify("中国移动 Token", "✅ 已更新", ts);
                } else {
                    console.log("CMCC: 未找到 QWHD_SESSION_TOKEN");
                    $notify("中国移动 Token", "❌ 获取失败", "未找到 session token");
                }
                $done({});
            });
        } catch (e) { console.log("CMCC: 异常 - " + e); $done({}); }
    });
}

// ==================== 入口 ====================
// http-request 模式: 从请求体提取 SSO 凭证
if (typeof $request !== "undefined" && $request.body) {
    try {
        const body = JSON.parse($request.body);
        if (body.token && body.token.length > 20) {
            const creds = { token: body.token, province: body.provinceCode, city: body.cityCode };
            $persistentStore.write(JSON.stringify(creds), "cmcc_sso");
            console.log("CMCC: SSO 凭证已捕获, 正在获取 token...");
            fetchToken(body.token, body.provinceCode, body.cityCode, body.userCheckId);
            return;
        }
    } catch (e) {}
}

// cron 模式: 用已保存的 SSO 凭证刷新
const saved = $persistentStore.read("cmcc_sso");
if (saved) {
    const c = JSON.parse(saved);
    const uid = (c.token.match(/UID=([^;]+)/) || ["", ""])[1];
    console.log("CMCC: 使用已保存凭证刷新 token...");
    fetchToken(c.token, c.province || "280", c.city || "028", uid.substring(0, 9));
} else {
    console.log("CMCC: 无 SSO 凭证, 请先打开 10086 APP 签到页面");
    $notify("中国移动 Token", "❌ 无凭证", "请先打开 10086 APP 签到页面");
    $done({});
}