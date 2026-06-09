/*
------------------------------------------
@Author: Sliverkiss / Minis fixed
@Date: 2026.05.25
@Description: NodeSeek 签到，多账号上限默认 10，修复 Surge 超时单位导致 check ck error
------------------------------------------

[Script]
# 获取 Cookie / token：登录 nodeseek 后点击个人名称，进入个人名片触发
http-response ^https:\/\/www\.nodeseek\.com\/api\/account\/getInfo\/.+\?readme=1.* script-path=https://example.com/nodeseek.js, requires-body=true, timeout=60, tag=NodeSeek获取token

# 定时签到，自行按需修改 cron
cron "10 8 * * *" script-path=https://example.com/nodeseek.js, timeout=120, tag=NodeSeek签到

[MITM]
hostname = www.nodeseek.com

BoxJS / 环境变量：
- nodeseek_data：自动保存的账号数组
- nodeseek_max_accounts：最多保存/执行账号数，默认 10
- nodeseek_default：是否随机鸡腿；false=固定领取5个鸡腿，true=随机领取鸡腿，默认 false
- is_debug：调试日志，默认 false
*/

const $ = new Env('NodeSeek');
const ckName = 'nodeseek_data';
const maxAccounts = parseInt(($.isNode() ? process.env.nodeseek_max_accounts : $.getdata('nodeseek_max_accounts')) || '10', 10);
const userCookie = $.toObj($.isNode() ? process.env[ckName] : $.getdata(ckName), []) || [];
$.userIdx = 0;
$.userList = [];
$.notifyMsg = [];
$.is_debug = ($.isNode() ? process.env.IS_DEDUG || process.env.is_debug : $.getdata('is_debug')) || 'false';
$.is_default = ($.isNode() ? process.env.nodeseek_default : $.getdata('nodeseek_default')) || 'false';
const notify = $.isNode() ? require('./sendNotify') : '';

async function main() {
    $.notifyMsg = [];
    $.title = '';
    for (let user of $.userList) {
        try {
            $.log(`[${user.userName || user.index}][INFO]当前签到模式:${$.is_default == 'false' ? '固定领取5个鸡腿' : '随机领取鸡腿'}\n`);
            const signMsg = await user.signin($.is_default);
            if (signMsg) DoubleLog(`账号${user.index}「${user.userName || '未知'}」${signMsg}`);
            if (user.ckStatus) {
                const userInfo = await user.userAccount();
                $.log(`[${user.userName || user.index}][INFO]查询用户信息成功...\n`);
                DoubleLog(`账号${user.index}「${userInfo?.member_name || user.userName || '未知'}」当前共${userInfo?.coin ?? '?'}个鸡腿🍗`);
            } else {
                DoubleLog(`⛔️ 账号${user.index}「${user.userName || '未知'}」check ck error!`);
            }
        } catch (e) {
            DoubleLog(`[账号${user.index} ${user.userName || ''}][ERROR]${e?.message || e}`);
        }
    }
    $.title = `完成 ${$.userList.length} 个账号`;
    await sendMsg($.notifyMsg.join('\n'));
}

class UserInfo {
    constructor(user) {
        this.index = ++$.userIdx;
        this.token = user.token || user;
        this.userId = user.userId;
        this.userName = user.userName;
        this.avatar = user.avatar;
        this.ckStatus = true;
        this.baseUrl = 'https://www.nodeseek.com';
        this.headers = {
            'connection': 'keep-alive',
            'accept-language': 'zh-CN,zh-Hans;q=0.9',
            'sec-fetch-mode': 'cors',
            'cookie': this.token,
            'referer': 'https://www.nodeseek.com',
            'accept-encoding': 'gzip, deflate, br',
            'host': 'www.nodeseek.com',
            'accept': '*/*',
            'sec-fetch-dest': 'empty',
            'sec-fetch-site': 'same-origin'
        };
        this.fetch = async (o) => {
            try {
                if (typeof o === 'string') o = { url: o };
                if (o?.url?.startsWith('/') || o?.url?.startsWith(':')) o.url = this.baseUrl + o.url;
                const res = await Request({ ...o, headers: o.headers || this.headers, url: o.url });
                debug(res, o?.url?.replace(/\/+$/, '').substring(o?.url?.lastIndexOf('/') + 1));
                if (res?.status == 404) throw new Error(res?.message || '用户需要去登录');
                return res;
            } catch (e) {
                this.ckStatus = false;
                $.log(`[${this.userName || this.index}][ERROR]请求发起失败!${e?.message || e}\n`);
            }
        };
    }

    async userAccount() {
        try {
            if (!this.userId) throw new Error('缺少 userId，请重新获取 token');
            const opts = {
                url: `/api/account/getInfo/${this.userId}?readme=1`,
                headers: {
                    'accept-encoding': 'gzip, deflate, br',
                    'sec-fetch-mode': 'cors',
                    'origin': 'https://www.nodeseek.com',
                    'referer': 'https://www.nodeseek.com/board',
                    'accept-language': 'zh-CN,zh-Hans;q=0.9',
                    'accept': '*/*',
                    'sec-fetch-dest': 'empty',
                    'cookie': this.token,
                    'content-length': '0',
                    'sec-fetch-site': 'same-origin'
                },
                alpn: 'h2'
            };
            const res = await this.fetch({ ...opts, timeout: 30000 });
            return res?.detail;
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName || this.index}][ERROR]查询积分余额:${e?.message || e}\n`);
        }
    }

    async signin(isDefault) {
        try {
            const opts = {
                url: '/api/attendance',
                params: { random: isDefault },
                alpn: 'h2',
                headers: {
                    'accept-encoding': 'gzip, deflate, br',
                    'sec-fetch-mode': 'cors',
                    'origin': 'https://www.nodeseek.com',
                    'referer': 'https://www.nodeseek.com/board',
                    'accept-language': 'zh-CN,zh-Hans;q=0.9',
                    'accept': '*/*',
                    'sec-fetch-dest': 'empty',
                    'cookie': this.token,
                    'content-length': '0',
                    'sec-fetch-site': 'same-origin'
                },
                type: 'post'
            };
            const res = await this.fetch({ ...opts, timeout: 30000 });
            $.log(`[${this.userName || this.index}][INFO]${res?.message}\n`);
            return res?.message;
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName || this.index}][ERROR]签到:${e?.message || e}\n`);
        }
    }
}

async function getCookie() {
    if (typeof $request === 'undefined') return;
    if ($request.method === 'OPTIONS') return;
    const header = ObjectKeys2LowerCase($request.headers) || {};
    const token = header.cookie;
    const Body = $.toObj($response.body);
    if (!(token && Body)) throw new Error('获取token失败！请检查重写配置是否正确');
    const { member_id, member_name } = Body?.detail || {};
    if (!member_id) throw new Error('获取用户信息失败，响应中没有 member_id');
    const newData = { userId: member_id, token, userName: member_name };
    const index = userCookie.findIndex(e => e.userId == newData.userId);
    if (index >= 0) {
        userCookie[index] = newData;
    } else if (userCookie.length < maxAccounts) {
        userCookie.push(newData);
    } else {
        throw new Error(`账号数量已达上限 ${maxAccounts} 个，如需更多请修改 nodeseek_max_accounts`);
    }
    $.setjson(userCookie.slice(0, maxAccounts), ckName);
    $.msg($.name, `🎉${newData.userName}更新token成功!`, `当前已保存 ${Math.min(userCookie.length, maxAccounts)} / ${maxAccounts} 个账号`);
}

!(async () => {
    if (typeof $request !== 'undefined') {
        await getCookie();
    } else {
        await checkEnv();
        await main();
    }
})()
    .catch(e => { $.logErr(e); $.msg($.name, '⛔️ script run error!', e?.message || e); })
    .finally(() => $.done({ ok: 1 }));

async function sendMsg(a) { if (a) $.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || '', a, { 'media-url': $.avatar }); }
function DoubleLog(o) { if (o) { $.log(`${o}`); $.notifyMsg.push(`${o}`); } }
async function checkEnv() {
    if (!userCookie?.length) throw new Error('no available accounts found');
    const accounts = userCookie.slice(0, maxAccounts);
    // 按用户名去重，保留最后一条
    const seen = {};
    const uniqueAccounts = [];
    for (let i = accounts.length - 1; i >= 0; i--) {
        const o = accounts[i];
        const key = o.userName || o.userId || o.token;
        if (!seen[key]) { seen[key] = 1; uniqueAccounts.unshift(o); }
    }
    // 清理存储中的重复数据
    if (uniqueAccounts.length < accounts.length) {
        $.log(`[INFO]发现 ${accounts.length - uniqueAccounts.length} 条重复账号，已自动清理\n`);
        $.setjson(uniqueAccounts.slice(0, maxAccounts), ckName);
    }
    $.log(`\n[INFO]检测到 ${userCookie?.length ?? 0} 个账号，去重后 ${uniqueAccounts.length} 个，上限 ${maxAccounts} 个\n`);
    $.userList.push(...uniqueAccounts.map(o => new UserInfo(o)).filter(Boolean));
}
function debug(g, e = 'debug') { if ($.is_debug === 'true') { $.log(`\n-----------${e}------------\n`); $.log(typeof g === 'string' ? g : $.toStr(g) || `debug error => t=${g}`); $.log(`\n-----------${e}------------\n`); } }
function ObjectKeys2LowerCase(obj) { return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])); }

// 修复版 Request：请求库 timeout 与 Promise.race timeout 分开，避免 Surge 下 30000ms 被误变 30ms
async function Request(t) {
    let p = 'get';
    try {
        if (typeof t === 'string') t = { url: t };
        if (!t?.url) throw new Error('[URL][ERROR]缺少 url 参数');
        let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = 'form', resultType: u = 'data' } = t;
        p = e ? e.toLowerCase() : 'body' in t ? 'post' : 'get';
        const c = o.concat('post' === p && a ? '?' + $.queryStr(a) : '');
        const rawTimeout = t.timeout || 10000;
        const reqTimeout = ($.isSurge() || $.isLoon() || $.isStash() || $.isShadowrocket()) ? rawTimeout / 1000 : rawTimeout;
        const raceTimeout = rawTimeout;
        if (n === 'json') r['Content-Type'] = 'application/json;charset=UTF-8';
        const y = s && n === 'form' ? $.queryStr(s) : $.toStr(s);
        const l = { ...t, ...(t?.opts ? t.opts : {}), url: c, headers: r, ...(p === 'post' && { body: y }), ...(p === 'get' && a && { params: a }), timeout: reqTimeout };
        const m = $.http[p](l).then(resp => u === 'data' ? $.toObj(resp.body) || resp.body : $.toObj(resp) || resp).catch(err => { throw err; });
        return Promise.race([new Promise((_, reject) => setTimeout(() => reject('当前请求已超时'), raceTimeout)), m]);
    } catch (e) {
        $.log(`[${p.toUpperCase()}][ERROR]${e?.message || e}\n`);
        throw e;
    }
}

function Env(name, opts) {
    class Http {
        constructor(env) { this.env = env; }
        send(opts, method = 'GET') { opts = typeof opts === 'string' ? { url: opts } : opts; return new Promise((resolve, reject) => { this[method.toLowerCase()](opts, (err, resp) => err ? reject(err) : resolve(resp)); }); }
        get(opts) { return this.send.call(this.env, opts); }
        post(opts) { return this.send.call(this.env, opts, 'POST'); }
    }
    return new class {
        constructor(name, opts) { this.name = name; this.http = new Http(this); this.data = null; this.dataFile = 'box.dat'; this.logs = []; this.isMute = false; this.isNeedRewrite = false; this.logSeparator = '\n'; this.encoding = 'utf-8'; this.startTime = Date.now(); Object.assign(this, opts); this.log('', `🔔${this.name}, 开始!`); }
        getEnv() { return typeof $environment !== 'undefined' && $environment['surge-version'] ? 'Surge' : typeof $environment !== 'undefined' && $environment['stash-version'] ? 'Stash' : typeof module !== 'undefined' && module.exports ? 'Node.js' : typeof $task !== 'undefined' ? 'Quantumult X' : typeof $loon !== 'undefined' ? 'Loon' : typeof $rocket !== 'undefined' ? 'Shadowrocket' : undefined; }
        isNode() { return this.getEnv() === 'Node.js'; }
        isQuanX() { return this.getEnv() === 'Quantumult X'; }
        isSurge() { return this.getEnv() === 'Surge'; }
        isLoon() { return this.getEnv() === 'Loon'; }
        isShadowrocket() { return this.getEnv() === 'Shadowrocket'; }
        isStash() { return this.getEnv() === 'Stash'; }
        toObj(str, fallback = null) { try { return JSON.parse(str); } catch { return fallback; } }
        toStr(obj, fallback = null) { try { return JSON.stringify(obj); } catch { return fallback; } }
        getjson(key, fallback) { let val = fallback; const data = this.getdata(key); if (data) try { val = JSON.parse(data); } catch {} return val; }
        setjson(val, key) { try { return this.setdata(JSON.stringify(val), key); } catch { return false; } }
        loaddata() { if (!this.isNode()) return {}; this.fs = this.fs || require('fs'); this.path = this.path || require('path'); const p1 = this.path.resolve(this.dataFile); const p2 = this.path.resolve(process.cwd(), this.dataFile); const file = this.fs.existsSync(p1) ? p1 : this.fs.existsSync(p2) ? p2 : null; if (!file) return {}; try { return JSON.parse(this.fs.readFileSync(file)); } catch { return {}; } }
        writedata() { if (!this.isNode()) return; this.fs = this.fs || require('fs'); this.path = this.path || require('path'); const file = this.path.resolve(this.dataFile); this.fs.writeFileSync(file, JSON.stringify(this.data)); }
        lodash_get(obj, path, def = '') { const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.'); let ret = obj; for (const k of keys) { ret = Object(ret)[k]; if (ret === undefined) return def; } return ret; }
        lodash_set(obj, path, val) { const keys = path.toString().match(/[^.[\]]+/g) || []; keys.slice(0, -1).reduce((a, k, i) => Object(a[k]) === a[k] ? a[k] : a[k] = Math.abs(keys[i + 1]) >> 0 == +keys[i + 1] ? [] : {}, obj)[keys[keys.length - 1]] = val; return obj; }
        getdata(key) { let val = this.getval(key); if (/^@/.test(key)) { const [, objKey, path] = /^@(.*?)\.(.*?)$/.exec(key) || []; const objVal = objKey ? this.getval(objKey) : ''; if (objVal) try { val = this.lodash_get(JSON.parse(objVal), path, ''); } catch { val = ''; } } return val; }
        setdata(val, key) { let ok = false; if (/^@/.test(key)) { const [, objKey, path] = /^@(.*?)\.(.*?)$/.exec(key) || []; const objVal = objKey ? this.getval(objKey) : '{}'; try { const obj = JSON.parse(objVal || '{}'); this.lodash_set(obj, path, val); ok = this.setval(JSON.stringify(obj), objKey); } catch { const obj = {}; this.lodash_set(obj, path, val); ok = this.setval(JSON.stringify(obj), objKey); } } else ok = this.setval(val, key); return ok; }
        getval(key) { switch (this.getEnv()) { case 'Surge': case 'Loon': case 'Stash': case 'Shadowrocket': return $persistentStore.read(key); case 'Quantumult X': return $prefs.valueForKey(key); case 'Node.js': this.data = this.loaddata(); return this.data[key]; default: return this.data && this.data[key] || null; } }
        setval(val, key) { switch (this.getEnv()) { case 'Surge': case 'Loon': case 'Stash': case 'Shadowrocket': return $persistentStore.write(val, key); case 'Quantumult X': return $prefs.setValueForKey(val, key); case 'Node.js': this.data = this.loaddata(); this.data[key] = val; this.writedata(); return true; default: return false; } }
        initGotEnv(opts) { this.got = this.got || require('got'); this.cktough = this.cktough || require('tough-cookie'); this.ckjar = this.ckjar || new this.cktough.CookieJar(); if (opts && !opts.headers?.Cookie && !opts.cookieJar) opts.cookieJar = this.ckjar; }
        get(opts, cb = () => {}) { if (opts.headers) { delete opts.headers['Content-Type']; delete opts.headers['Content-Length']; delete opts.headers['content-type']; delete opts.headers['content-length']; } if (opts.params) opts.url += '?' + this.queryStr(opts.params); switch (this.getEnv()) { case 'Surge': case 'Loon': case 'Stash': case 'Shadowrocket': default: $httpClient.get(opts, (err, resp, body) => { if (!err && resp) { resp.body = body; resp.statusCode = resp.status || resp.statusCode; resp.status = resp.statusCode; } cb(err, resp, body); }); break; case 'Quantumult X': $task.fetch(opts).then(resp => cb(null, { status: resp.statusCode, statusCode: resp.statusCode, headers: resp.headers, body: resp.body, bodyBytes: resp.bodyBytes }, resp.body), err => cb(err && err.error || 'UndefinedError')); break; case 'Node.js': this.initGotEnv(opts); this.got(opts).then(resp => cb(null, { status: resp.statusCode, statusCode: resp.statusCode, headers: resp.headers, rawBody: resp.rawBody, body: resp.body }, resp.body), err => cb(err.message, err.response, err.response && err.response.body)); } }
        post(opts, cb = () => {}) { const method = opts.method ? opts.method.toLowerCase() : 'post'; if (opts.body && opts.headers && !opts.headers['Content-Type'] && !opts.headers['content-type']) opts.headers['content-type'] = 'application/x-www-form-urlencoded'; if (opts.headers) { delete opts.headers['Content-Length']; delete opts.headers['content-length']; } switch (this.getEnv()) { case 'Surge': case 'Loon': case 'Stash': case 'Shadowrocket': default: $httpClient[method](opts, (err, resp, body) => { if (!err && resp) { resp.body = body; resp.statusCode = resp.status || resp.statusCode; resp.status = resp.statusCode; } cb(err, resp, body); }); break; case 'Quantumult X': opts.method = method; $task.fetch(opts).then(resp => cb(null, { status: resp.statusCode, statusCode: resp.statusCode, headers: resp.headers, body: resp.body, bodyBytes: resp.bodyBytes }, resp.body), err => cb(err && err.error || 'UndefinedError')); break; case 'Node.js': this.initGotEnv(opts); const { url, ...rest } = opts; this.got[method](url, rest).then(resp => cb(null, { status: resp.statusCode, statusCode: resp.statusCode, headers: resp.headers, rawBody: resp.rawBody, body: resp.body }, resp.body), err => cb(err.message, err.response, err.response && err.response.body)); } }
        queryStr(obj) { let s = ''; for (const k in obj) { let v = obj[k]; if (v !== null && v !== undefined && v !== '') { if (typeof v === 'object') v = JSON.stringify(v); s += `${k}=${v}&`; } } return s.slice(0, -1); }
        msg(title = name, subt = '', desc = '', opts) { const toOpts = o => { if (!o) return o; if (typeof o === 'string') return this.isQuanX() ? { 'open-url': o } : this.isLoon() || this.isShadowrocket() ? o : { url: o }; if (typeof o === 'object') return this.isQuanX() ? { 'open-url': o['open-url'] || o.url || o.openUrl, 'media-url': o['media-url'] || o.mediaUrl } : this.isLoon() ? { openUrl: o.openUrl || o.url || o['open-url'], mediaUrl: o.mediaUrl || o['media-url'] } : { url: o.url || o.openUrl || o['open-url'] }; };
            if (!this.isMute) { switch (this.getEnv()) { case 'Surge': case 'Stash': case 'Shadowrocket': default: $notification.post(title, subt, desc, toOpts(opts)); break; case 'Loon': $notification.post(title, subt, desc, toOpts(opts)); break; case 'Quantumult X': $notify(title, subt, desc, toOpts(opts)); break; case 'Node.js': break; } }
            this.log('', '==============📣系统通知📣==============', title, subt, desc);
        }
        log(...args) { if (args.length) this.logs.push(...args); console.log(args.join(this.logSeparator)); }
        logErr(err) { this.log('', `❗️${this.name}, 错误!`, this.isNode() ? err?.stack || err : err); }
        wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
        done(val = {}) { const cost = (Date.now() - this.startTime) / 1000; this.log('', `🔔${this.name}, 结束! 🕛 ${cost} 秒`, ''); switch (this.getEnv()) { case 'Surge': case 'Loon': case 'Stash': case 'Shadowrocket': case 'Quantumult X': default: if (typeof $done !== 'undefined') $done(val); break; case 'Node.js': break; } }
    }(name, opts);