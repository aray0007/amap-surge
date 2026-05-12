/*
@Name: 中国联通 自动签到 (Surge 适配版)
@Author: Gemini & Copilot

======= Surge 配置 =======
[Script]
# 模式1: 抓包获取 Cookie
联通获取Cookie = type=http-request,pattern=^https?:\/\/activity\.10010\.com\/,requires-body=false,max-size=0,script-path=unicom_signin.js

# 模式2: 定时签到 (每天 08:30 运行)
联通自动签到 = type=cron,cronexp="30 8 * * *",script-path=unicom_signin.js,timeout=60

[MITM]
hostname = %APPEND% activity.10010.com
========================
*/

const NAME = '中国联通签到';
const STORE_KEY = 'unicom_cookie_v1';
const SIGN_URL = 'https://activity.10010.com/sixPalaceGridTurntableLottery/signin/daySign';

// 获取持久化存储的环境变量适配
const isSurge = typeof $persistentStore !== 'undefined';
const storage = {
  get: (key) => isSurge ? $persistentStore.read(key) : $prefs.valueForKey(key),
  set: (val, key) => isSurge ? $persistentStore.write(val, key) : $prefs.setValueForKey(val, key)
};

// ---- 模式1：HTTP Request 抓包保存 Cookie ----
if (typeof $request !== 'undefined') {
  const headers = $request.headers;
  let cookie = headers['Cookie'] || headers['cookie'];
  
  if (cookie) {
    if (storage.set(cookie, STORE_KEY)) {
      $notification.post(NAME, 'Cookie 已保存', '下次任务运行将自动使用新 Cookie');
    }
  }
  $done({});
} 

// ---- 模式2：Cron 定时运行签到 ----
else {
  const cookie = storage.get(STORE_KEY);
  
  if (!cookie) {
    $notification.post(NAME, '请先抓包', '打开联通 App 进入积分界面触发一次请求');
    $done();
  } else {
    const request = {
      url: SIGN_URL,
      method: 'POST',
      headers: {
        'Host': 'activity.10010.com',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://img.client.10010.com',
        'Referer': 'https://img.client.10010.com/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) unicom{version:iphone_c@12.1000};ltst;OSVersion/26.4.2',
        'Cookie': cookie
      },
      body: 'shareCl=&shareCode='
    };

    $httpClient.post(request, (error, response, data) => {
      if (error) {
        $notification.post(NAME, '网络错误', error);
        $done();
        return;
      }

      try {
        const res = JSON.parse(data);
        if (res.code === '0000') {
          const info = res.data || {};
          const desc = info.statusDesc || '签到成功';
          const prize = info.redSignMessage || '';
          $notification.post(NAME, desc, prize);
        } else {
          $notification.post(NAME, '签到失败', `Code: ${res.code} ${res.desc || ''}`);
        }
      } catch (e) {
        $notification.post(NAME, '解析失败', data.substring(0, 80));
      }
      $done();
    });
  }
}
