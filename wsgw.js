/*
⚡ 网上国网自动签到脚本 (Surge & Quantumult X 双平台兼容版)

--------------------------------------------------
[Surge 配置说明]
[Script]
# 1. 抓取 Cookie 和请求体
wsgw_get = type=http-request,pattern=^https:\/\/csc-service\.sgcc\.com\.cn:\d+\/osg-omgmt1042\/inner\/signInConfig\/f90,requires-body=1,max-size=1048576,script-path=wsgw.js

# 2. 每日定时签到 (每天上午 8:30 运行)
wsgw_sign = type=cron,cronexp="30 8 * * *",script-path=wsgw.js,wake-system=1

[MITM]
hostname = %APPEND% csc-service.sgcc.com.cn
--------------------------------------------------
[Quantumult X 配置说明]
[rewrite_local]
# 1. 抓取 Cookie 和请求体
^https:\/\/csc-service\.sgcc\.com\.cn:\d+\/osg-omgmt1042\/inner\/signInConfig\/f90 url script-request-body wsgw.js

[task_local]
# 2. 每日定时签到 (每天上午 8:30 运行)
30 8 * * * wsgw.js, tag=网上国网自动签到, enabled=true

[mitm]
hostname = csc-service.sgcc.com.cn
--------------------------------------------------
*/

const $ = new Env("网上国网");
const isRewrite = typeof $request !== "undefined";

if (isRewrite) {
  getCookie();
} else {
  sign();
}

// 1. 自动抓取并保存 Cookie / Body 数据
function getCookie() {
  if ($request.url.indexOf("signInConfig/f90") > -1) {
    const url = $request.url;
    const headers = $request.headers;
    const body = $request.body;

    const cookie = headers["Cookie"] || headers["cookie"];
    const ua = headers["User-Agent"] || headers["user-agent"];

    if (cookie) $.setdata(cookie, "sgcc_cookie");
    if (ua) $.setdata(ua, "sgcc_ua");
    if (body) $.setdata(body, "sgcc_body");
    $.setdata(url, "sgcc_url");

    $.msg("网上国网", "获取签到数据成功", "已保存最新 Cookie、User-Agent 和签到请求体。");
    console.log("[网上国网] 成功保存数据:\nCookie: " + cookie + "\nBody: " + body);
  }
  $.done({});
}

// 2. 定时自动签到任务
function sign() {
  const cookie = $.getdata("sgcc_cookie");
  const ua = $.getdata("sgcc_ua");
  const body = $.getdata("sgcc_body");
  const url = $.getdata("sgcc_url") || "https://csc-service.sgcc.com.cn:28630/osg-omgmt1042/inner/signInConfig/f90";

  if (!cookie || !body) {
    $.msg("网上国网", "自动签到失败", "未获取到保存的 Cookie 或请求体，请先打开网上国网 App 手动签到一次以抓取数据。");
    $.done();
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    "Cookie": cookie,
    "User-Agent": ua || "wang shang guo wang/3.2.2 (iPhone; iOS 27.0; Scale/3.00)"
  };

  const opts = {
    url: url,
    headers: headers,
    body: body
  };

  $.post(opts, (err, resp, data) => {
    if (err) {
      $.msg("网上国网", "请求网络错误", err.toString());
      $.done();
      return;
    }
    
    console.log("[网上国网] 返回结果: " + data);

    if (data.includes("encryptData") || data.includes("respKey") || data.includes("成功") || data.includes("success") || data.includes("\"code\":\"0\"")) {
      $.msg("网上国网", "签到成功", "自动签到运行成功！");
    } else {
      try {
        const obj = JSON.parse(data);
        if (obj.message) {
          $.msg("网上国网", "签到结果", obj.message);
        } else {
          $.msg("网上国网", "签到结果", `失败代码: ${obj.code || '未知'}`);
        }
      } catch (e) {
        $.msg("网上国网", "签到结果", data);
      }
    }
    $.done();
  });
}

// 兼容环境类 Env (支持 Surge / Quantumult X / Loon)
function Env(name) {
  this.name = name;
  this.isQX = typeof $task !== "undefined";
  this.isSurge = typeof $httpClient !== "undefined" && typeof $task === "undefined";
  this.isLoon = typeof $loon !== "undefined";
  
  this.getdata = (key) => {
    if (this.isQX) return $prefs.valueForKey(key);
    if (this.isSurge || this.isLoon) return $persistentStore.read(key);
  };
  
  this.setdata = (val, key) => {
    if (this.isQX) return $prefs.setValueForKey(val, key);
    if (this.isSurge || this.isLoon) return $persistentStore.write(val, key);
  };
  
  this.msg = (title, subtitle, body) => {
    if (this.isQX) $notify(title, subtitle, body);
    if (this.isSurge || this.isLoon) $notification.post(title, subtitle, body);
  };
  
  this.post = (opts, callback) => {
    if (this.isQX) {
      opts.method = "POST";
      $task.fetch(opts).then(
        resp => callback(null, resp, resp.body),
        err => callback(err, null, null)
      );
    }
    if (this.isSurge || this.isLoon) {
      $httpClient.post(opts, (err, resp, body) => {
        callback(err, resp, body);
      });
    }
  };
  
  this.done = (val = {}) => {
    if (typeof $done !== "undefined") $done(val);
  };
}
