// 2026/05/08
/*
@Name: WeTalk 自动化签到 + 视频奖励
@Author: TG@ZenMoFiShi
@Rewrite: Surge Local Script
@Desc: Surge 本地脚本版；支持抓取参数、多账号、签到、视频奖励

Surge Module 示例：
[Script]
WeTalk获取签到参数 = type=http-request, pattern=^https:\/\/api\.wetalkapp\.com\/app\/queryBalanceAndBonus, script-path=WeTalk.js, timeout=60, enabled=false
WeTalk签到 = type=cron,cronexp=30 6,15,20 * * *,script-path=WeTalk.js,timeout=300,script-update-interval=0

[MITM]
hostname = api.wetalkapp.com
*/

const scriptName = 'WeTalk';
const storeKey = 'wetalk_accounts_v1';
const SECRET = '0fOiukQq7jXZV2GRi9LGlO';
const API_HOST = 'api.wetalkapp.com';
const MAX_VIDEO = 5;
const VIDEO_DELAY = 8000;
const ACCOUNT_GAP = 3500;

const D = {
  ios: '17.5.1 17.6.1 17.4.1 17.2.1 16.7.8 17.6 17.3.1 18.0.1 17.1.2 16.6.1'.split(' '),
  scale: '2.00 3.00 3.00 2.00 3.00'.split(' '),
  model: 'iPhone14,3 iPhone13,3 iPhone15,3 iPhone16,1 iPhone14,7 iPhone13,2 iPhone15,2 iPhone12,1'.split(' '),
  cfn: '1410.0.3 1494.0.7 1568.100.1 1209.1 1474.0.4 1568.200.2'.split(' '),
  darwin: '22.6.0 23.5.0 23.6.0 24.0.0 22.4.0'.split(' '),
};

function kvGet(key) {
  try {
    return $persistentStore.read(key) || '';
  } catch (e) {
    return '';
  }
}

function kvSet(key, val) {
  try {
    return $persistentStore.write(val, key);
  } catch (e) {
    return false;
  }
}

function notify(title, body) {
  try {
    $notification.post(scriptName, title || '', body || '');
  } catch (e) {
    console.log(`${scriptName} 通知失败: ${e}`);
  }
}

function fetchRemote(options) {
  return new Promise((resolve, reject) => {
    const method = String(options.method || 'GET').toUpperCase();
    const fn = method === 'POST' ? $httpClient.post : $httpClient.get;

    fn(options, (error, response, body) => {
      if (error) return reject(error);
      resolve({ response, body });
    });
  });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function MD5(string) {
  function RotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }

  function AddUnsigned(lX, lY) {
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);

    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      return (lResult & 0x40000000)
        ? (lResult ^ 0xC0000000 ^ lX8 ^ lY8)
        : (lResult ^ 0x40000000 ^ lX8 ^ lY8);
    }
    return lResult ^ lX8 ^ lY8;
  }

  function F(x, y, z) { return (x & y) | ((~x) & z); }
  function G(x, y, z) { return (x & z) | (y & (~z)); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | (~z)); }

  function FF(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function GG(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function HH(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function II(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function ConvertToWordArray(str) {
    const lMessageLength = str.length;
    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
    const lWordArray = Array(lNumberOfWords - 1).fill(0);
    let lBytePosition = 0;
    let lByteCount = 0;

    while (lByteCount < lMessageLength) {
      const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] |= str.charCodeAt(lByteCount) << lBytePosition;
      lByteCount++;
    }

    const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] |= 0x80 << lBytePosition;
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;

    return lWordArray;
  }

  function WordToHex(lValue) {
    let WordToHexValue = '';
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      const WordToHexValueTemp = '0' + lByte.toString(16);
      WordToHexValue += WordToHexValueTemp.substr(WordToHexValueTemp.length - 2, 2);
    }
    return WordToHexValue;
  }

  const x = ConvertToWordArray(string);
  let a = 0x67452301;
  let b = 0xEFCDAB89;
  let c = 0x98BADCFE;
  let d = 0x10325476;

  const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a;
    const BB = b;
    const CC = c;
    const DD = d;

    a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
    b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
    a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
    c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
    c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);

    a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
    b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
    a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
    d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
    a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);

    a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
    a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
    d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
    c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x04881D05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);

    a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
    c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
    b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
    c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
    d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
    c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
    a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
    d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
    b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);

    a = AddUnsigned(a, AA);
    b = AddUnsigned(b, BB);
    c = AddUnsigned(c, CC);
    d = AddUnsigned(d, DD);
  }

  return (WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d)).toLowerCase();
}

function getUTCSignDate() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

function normalizeHeaderNameMap(headers) {
  const out = {};
  Object.keys(headers || {}).forEach(k => {
    out[k] = headers[k];
  });
  return out;
}

function parseRawQuery(url) {
  const query = (url.split('?')[1] || '').split('#')[0];
  const rawMap = {};

  query.split('&').forEach(pair => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1);
    rawMap[k] = v;
  });

  return rawMap;
}

function getValueByKeys(obj, keys) {
  const map = {};
  Object.keys(obj || {}).forEach(k => {
    map[k.toLowerCase()] = obj[k];
  });

  for (const k of keys) {
    const v = map[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v) !== '') {
      return `${k}=${String(v)}`;
    }
  }

  return '';
}

function fingerprintOf(paramsRaw, headers) {
  const userPart = getValueByKeys(paramsRaw, [
    'userId', 'userid', 'uid', 'accountId', 'accountid', 'memberId', 'memberid',
    'openId', 'openid', 'loginId', 'loginid', 'customerId', 'customerid'
  ]);

  if (userPart) return MD5('wetalk-user|' + userPart).slice(0, 12);

  const tokenPart = getValueByKeys(paramsRaw, [
    'token', 'userToken', 'usertoken', 'accessToken', 'accesstoken',
    'authToken', 'authtoken', 'sessionToken', 'sessiontoken', 'session', 'sid'
  ]);

  if (tokenPart) return MD5('wetalk-token|' + tokenPart).slice(0, 12);

  const headerPart = getValueByKeys(headers, [
    'Authorization', 'authorization', 'Token', 'token', 'X-Token', 'x-token',
    'User-Token', 'user-token', 'Cookie', 'cookie'
  ]);

  if (headerPart) return MD5('wetalk-header|' + headerPart).slice(0, 12);

  const drop = /^(sign|signdate|timestamp|time|ts|nonce|random|reqtime|reqid|requestid|traceid|logid|eventid|adid|callback|_|__|uuid|deviceid|idfa|idfv|oaid|imei|imsi)$/i;
  const base = Object.keys(paramsRaw || {})
    .filter(k => !drop.test(k))
    .sort()
    .map(k => `${k}=${paramsRaw[k]}`)
    .join('&');

  return MD5('wetalk-params|' + base).slice(0, 12);
}

function loadStore() {
  const raw = kvGet(storeKey);
  if (!raw) return { version: 1, accounts: {}, order: [] };

  try {
    const obj = JSON.parse(raw);
    if (!obj.accounts) obj.accounts = {};
    if (!Array.isArray(obj.order)) obj.order = Object.keys(obj.accounts);
    return obj;
  } catch (e) {
    return { version: 1, accounts: {}, order: [] };
  }
}

function saveStore(store) {
  kvSet(storeKey, JSON.stringify(store));
}

function buildUA(baseUA, seed) {
  const pick = (k, off) => D[k][(seed + off) % D[k].length];

  const iosVer = pick('ios', 0);
  const scale = pick('scale', 1);
  const model = pick('model', 2);
  const cfn = pick('cfn', 3);
  const darwin = pick('darwin', 4);

  if (baseUA && typeof baseUA === 'string') {
    let ua = baseUA;
    let changed = false;

    if (/iOS \d+(\.\d+){0,2}/.test(ua)) {
      ua = ua.replace(/iOS \d+(\.\d+){0,2}/, `iOS ${iosVer}`);
      changed = true;
    }

    if (/Scale\/\d+(\.\d+)?/.test(ua)) {
      ua = ua.replace(/Scale\/\d+(\.\d+)?/, `Scale/${scale}`);
      changed = true;
    }

    if (/iPhone\d+,\d+/.test(ua)) {
      ua = ua.replace(/iPhone\d+,\d+/, model);
      changed = true;
    }

    if (/CFNetwork\/[\d.]+/.test(ua)) {
      ua = ua.replace(/CFNetwork\/[\d.]+/, `CFNetwork/${cfn}`);
      changed = true;
    }

    if (/Darwin\/[\d.]+/.test(ua)) {
      ua = ua.replace(/Darwin\/[\d.]+/, `Darwin/${darwin}`);
      changed = true;
    }

    if (changed) return ua;
  }

  return `WeTalk/30.6.0 (com.innovationworks.wetalk; build:28; iOS ${iosVer}) Alamofire/5.4.3`;
}

function buildSignedParamsRaw(capture) {
  const params = {};

  Object.keys(capture.paramsRaw || {}).forEach(k => {
    if (k !== 'sign' && k !== 'signDate') params[k] = capture.paramsRaw[k];
  });

  params.signDate = getUTCSignDate();

  const signBase = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');

  params.sign = MD5(signBase + SECRET);
  return params;
}

function buildUrl(path, capture) {
  const params = buildSignedParamsRaw(capture);
  const qs = Object.keys(params)
    .map(k => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');

  return `https://${API_HOST}/app/${path}?${qs}`;
}

function cloneHeaders(headers) {
  const out = {};
  Object.keys(headers || {}).forEach(k => {
    out[k] = headers[k];
  });
  return out;
}

function buildHeaders(capture, ua) {
  const headers = cloneHeaders(capture.headers || {});

  delete headers['Content-Length'];
  delete headers['content-length'];
  delete headers[':authority'];
  delete headers[':method'];
  delete headers[':path'];
  delete headers[':scheme'];

  headers.Host = API_HOST;
  headers.Accept = headers.Accept || 'application/json';

  Object.keys(headers).forEach(k => {
    if (k.toLowerCase() === 'user-agent') delete headers[k];
  });

  headers['User-Agent'] = ua;
  return headers;
}

function runAccount(acc, index, total) {
  const tag = `[账号${index + 1}/${total} ${acc.alias || acc.id}]`;
  const ua = buildUA(acc.baseUA, acc.uaSeed);
  const headers = buildHeaders(acc.capture, ua);
  const msgs = [tag];

  function fetchApi(path) {
    return fetchRemote({
      url: buildUrl(path, acc.capture),
      method: 'GET',
      headers
    });
  }

  function doVideoLoop(count) {
    let i = 0;

    function next() {
      if (i >= count) return Promise.resolve();

      return new Promise(resolve => {
        setTimeout(() => {
          i++;

          fetchApi('videoBonus').then(res => {
            const d = safeJson(res.body);
            if (!d) {
              msgs.push(`❌ 视频${i}：解析失败`);
              return resolve();
            }

            if (d.retcode === 0) {
              const bonus = d.result && d.result.bonus !== undefined ? d.result.bonus : '?';
              msgs.push(`🎬 视频${i}：+${bonus} Coins`);
              resolve(next());
            } else {
              msgs.push(`⏸ 视频${i}：${d.retmsg || '停止'}`);
              resolve();
            }
          }).catch(err => {
            msgs.push(`❌ 视频${i}：${err && err.error ? err.error : '请求失败'}`);
            resolve();
          });
        }, i === 0 ? 1500 : VIDEO_DELAY);
      });
    }

    return next();
  }

  return fetchApi('queryBalanceAndBonus').then(res => {
    const d = safeJson(res.body);
    if (d && d.retcode === 0) {
      msgs.push(`💰 余额：${d.result.balance} Coins`);
    } else if (d) {
      msgs.push(`⚠️ 查询：${d.retmsg || '失败'}`);
    } else {
      msgs.push('❌ 查询：解析失败');
    }

    return fetchApi('checkIn');
  }).then(res => {
    const d = safeJson(res.body);
    if (d && d.retcode === 0) {
      const hint = ((d.result && d.result.bonusHint) || d.retmsg || '').replace(/\n/g, ' ');
      msgs.push(`✅ 签到：${hint}`);
    } else if (d) {
      msgs.push(`⚠️ 签到：${d.retmsg || '失败'}`);
    } else {
      msgs.push('❌ 签到：解析失败');
    }

    return doVideoLoop(MAX_VIDEO);
  }).then(() => fetchApi('queryBalanceAndBonus')).then(res => {
    const d = safeJson(res.body);
    if (d && d.retcode === 0) {
      msgs.push(`💰 最新余额：${d.result.balance} Coins`);
    }

    return msgs.join('\n');
  }).catch(err => {
    msgs.push(`❌ 异常：${err && err.error ? err.error : String(err)}`);
    return msgs.join('\n');
  });
}

function captureAccount() {
  const paramsRaw = parseRawQuery($request.url);
  const headersMap = normalizeHeaderNameMap($request.headers || {});

  let baseUA = '';
  Object.keys(headersMap).forEach(k => {
    if (k.toLowerCase() === 'user-agent') baseUA = headersMap[k];
  });

  const store = loadStore();
  const fp = fingerprintOf(paramsRaw, headersMap);
  const now = Date.now();
  const existed = !!store.accounts[fp];
  const uaSeed = existed ? store.accounts[fp].uaSeed : store.order.length;
  const alias = existed ? store.accounts[fp].alias : `账号${store.order.length + 1}`;

  store.accounts[fp] = {
    id: fp,
    alias,
    uaSeed,
    baseUA,
    capture: {
      url: $request.url,
      paramsRaw,
      headers: headersMap
    },
    createdAt: existed ? store.accounts[fp].createdAt : now,
    updatedAt: now
  };

  if (!existed) store.order.push(fp);
  saveStore(store);

  const total = store.order.length;
  notify(
    existed ? '🔄 账号参数已更新' : '✅ 新账号已入库',
    `${alias}（id:${fp}）\n当前账号总数：${total}`
  );

  console.log(`【${scriptName}】${existed ? 'update' : 'add'} account ${fp}\n${JSON.stringify(store.accounts[fp], null, 2)}`);
  $done({});
}

function runTask() {
  const store = loadStore();
  const ids = store.order.filter(id => store.accounts[id]);

  if (!ids.length) {
    notify('⚠️ 未抓到任何账号', '请先启用获取参数脚本，然后打开 WeTalk 触发 queryBalanceAndBonus');
    return $done();
  }

  const total = ids.length;
  const results = [];
  let chain = Promise.resolve();

  ids.forEach((id, idx) => {
    chain = chain
      .then(() => runAccount(store.accounts[id], idx, total))
      .then(text => {
        results.push(text);
      })
      .then(() => idx < ids.length - 1 ? sleep(ACCOUNT_GAP) : null);
  });

  chain.then(() => {
    notify(`🎉 全部完成 (${total}个账号)`, results.join('\n———\n'));
    $done();
  }).catch(err => {
    notify('❌ 任务异常', results.join('\n———\n') + '\n' + (err && err.error ? err.error : String(err)));
    $done();
  });
}

try {
  if (typeof $request !== 'undefined' && $request) {
    captureAccount();
  } else {
    runTask();
  }
} catch (e) {
  notify('❌ 脚本异常', String(e && e.stack ? e.stack : e));
  $done();
}
