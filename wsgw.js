/*
⚡ 网上国网自动签到脚本 (Quantumult X 专用)
说明：
1. 开启重写与 MITM，进入 App 点击签到页面即可自动抓取 Cookie 和请求体。
2. 定时任务会自动读取最新抓取的参数进行签到。
*/

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

    if (cookie) {
      $prefs.setValueForKey(cookie, "sgcc_cookie");
    }
    if (ua) {
      $prefs.setValueForKey(ua, "sgcc_ua");
    }
    if (body) {
      $prefs.setValueForKey(body, "sgcc_body");
    }
    $prefs.setValueForKey(url, "sgcc_url");

    $notify("网上国网", "获取签到数据成功", "已保存最新 Cookie、User-Agent 和签到请求体。");
    console.log("[网上国网] 成功保存数据:\nCookie: " + cookie + "\nBody: " + body);
  }
  $done({});
}

// 2. 定时自动签到任务
function sign() {
  const cookie = $prefs.valueForKey("sgcc_cookie");
  const ua = $prefs.valueForKey("sgcc_ua");
  const body = $prefs.valueForKey("sgcc_body");
  const url = $prefs.valueForKey("sgcc_url") || "https://csc-service.sgcc.com.cn:28630/osg-omgmt1042/inner/signInConfig/f90";

  if (!cookie || !body) {
    $notify("网上国网", "自动签到失败", "未获取到保存的 Cookie 或请求体，请先打开网上国网 App 手动签到一次以抓取数据。");
    $done();
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    "Cookie": cookie,
    "User-Agent": ua || "wang shang guo wang/3.2.2 (iPhone; iOS 27.0; Scale/3.00)"
  };

  $task.fetch({
    url: url,
    method: "POST",
    headers: headers,
    body: body
  }).then(response => {
    const msg = response.body;
    console.log("[网上国网] 返回结果: " + msg);

    // 判断返回结果是否包含成功特征
    if (msg.includes("encryptData") || msg.includes("respKey") || msg.includes("成功") || msg.includes("success") || msg.includes("\"code\":\"0\"")) {
      $notify("网上国网", "签到成功", "自动签到运行成功！");
    } else {
      // 尝试解析具体的报错原因
      try {
        const obj = JSON.parse(msg);
        if (obj.message) {
          $notify("网上国网", "签到结果", obj.message);
        } else {
          $notify("网上国网", "签到结果", `失败代码: ${obj.code || '未知'}`);
        }
      } catch (e) {
        $notify("网上国网", "签到结果", msg);
      }
    }
    $done();
  }).catch(error => {
    $notify("网上国网", "请求网络错误", error.toString());
    $done();
  });
}
