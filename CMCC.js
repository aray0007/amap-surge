/**
 * 中国移动 APP 自动签到
 *
 * 每天自动: 刷新 token → 签到
 *
 * 配置:
 *   [Script]
 *   cmcc-token = type=http-request,pattern=^https://wx\.10086\.cn/qwhdsso/appTokenLogin,requires-body=1,max-size=0,script-path=cmcc_get_token.js
 *   cmcc-sign = type=cron,cronexp="0 0 8 * * *",script-path=cmcc_signin.js
 *   [MITM]
 *   hostname = %APPEND% wx.10086.cn
 */

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148/wkwebview leadeon/12.1.1/CMCCIT";
const MARK = "https://wx.10086.cn/qwhdhub/api/mark/mark31/domark";
const REFERER = "https://wx.10086.cn/qwhdhub/qwhdmark/1021122301?channelId=P00000109876";
const today = (() => { const d = new Date(); return "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); })();

function sign(token, retried) {
    $httpClient.post({
        url: MARK,
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "User-Agent": UA,
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://wx.10086.cn",
            "Referer": REFERER,
            "Cookie": "QWHD_SESSION_TOKEN=" + token
        },
        body: JSON.stringify({ date: today })
    }, (e, r, d) => {
        if (e) { $notify("中国移动", "❌ 网络错误", e); $done({}); return; }
        try {
            const j = JSON.parse(d);
            if (j.code === "SUCCESS" || j.code === "PRIZE_NO_STOCK" || j.code === "PRIZE_NO_CONFIG" ||
                (j.code === "HAVE_MARKED") || (j.code === "FAILED" && (j.msg || "").includes("已签到"))) {
                const p = j.data && j.data.markPrize && j.data.markPrize.name ? "\n🎁 " + j.data.markPrize.name : "";
                $notify("中国移动", "✅ 签到成功", (j.msg || "") + p);
                $done({});
            } else if (!retried) {
                // token 可能过期, 刷新后重试
                refresh((newToken) => { newToken ? sign(newToken, true) : ($notify("中国移动", "❌ 签到失败", j.msg), $done({})); });
            } else {
                $notify("中国移动", "❌ 签到失败", j.msg || j.code);
                $done({});
            }
        } catch (x) { $notify("中国移动", "❌ 解析错误", d.substring(0, 100)); $done({}); }
    });
}

function refresh(cb) {
    const saved = $persistentStore.read("cmcc_sso");
    if (!saved) { console.log("CMCC: 无 SSO 凭证"); cb(null); return; }
    const c = JSON.parse(saved);
    const uid = (c.token.match(/UID=([^;]+)/) || ["", ""])[1];
    $httpClient.post({
        url: "https://wx.10086.cn/qwhdsso/appTokenLogin",
        headers: { "Content-Type": "application/json;charset=UTF-8", "User-Agent": UA },
        body: JSON.stringify({
            jwtToken: null, token: c.token, provinceCode: c.province || "280", cityCode: c.city || "028",
            userCheckId: uid.substring(0, 9), carrierOperator: "002", appVersionCode: "12.1.1",
            took: Math.floor(Math.random() * 200) + 50
        })
    }, (e, r, d) => {
        if (e) { console.log("CMCC: 登录失败 - " + e); cb(null); return; }
        try {
            const j = JSON.parse(d);
            if (j.code !== "SUCCESS") { console.log("CMCC: " + j.msg); cb(null); return; }
            $httpClient.get({ url: j.data.url, headers: { "User-Agent": UA, "Origin": "https://wx.10086.cn" } }, (e2, h, b) => {
                const m = (h.headers["set-cookie"] || h.headers["Set-Cookie"] || "").match(/QWHD_SESSION_TOKEN=([^;]+)/);
                if (m) {
                    $persistentStore.write(m[1], "cmcc_token");
                    console.log("CMCC: Token 已刷新");
                    cb(m[1]);
                } else { cb(null); }
            });
        } catch (x) { cb(null); }
    });
}

// ==================== 入口: 优先用缓存 token, 失败自动刷新 ====================
const token = $persistentStore.read("cmcc_token");
if (token) {
    sign(token, false);
} else {
    refresh((t) => { t ? sign(t, true) : ($notify("中国移动", "❌ 无 Token", "请先打开 APP 签到页面"), $done({})); });
}