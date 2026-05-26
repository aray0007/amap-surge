/*
广汽本田 登录态获取脚本
用于自动保存 X-Access-Token / customerCode / deviceToken / Cookie
*/

const KEY = 'GHA_AUTH';

function notify(title, subtitle, message) {
  try {
    if (typeof $notification !== 'undefined') {
      $notification.post(title, subtitle || '', message || '');
    }
  } catch (_) {}

  try {
    if (typeof $notify === 'function') {
      $notify(title, subtitle || '', message || '');
    }
  } catch (_) {}

  console.log([title, subtitle, message].filter(Boolean).join(' | '));
}

function getHeader(headers, name) {
  if (!headers) return '';

  const target = name.toLowerCase();

  for (const k in headers) {
    if (String(k).toLowerCase() === target) {
      return headers[k];
    }
  }

  return '';
}

function tokenExpireText(token) {
  try {
    const part = token.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64));
    if (!json.exp) return '未知';
    return new Date(json.exp * 1000).toLocaleString();
  } catch (e) {
    return '解析失败';
  }
}

try {
  const headers = $request.headers || {};

  const oldRaw = $persistentStore.read(KEY);
  const old = oldRaw ? JSON.parse(oldRaw) : {};

  const auth = {
    xAccessToken: getHeader(headers, 'X-Access-Token') || old.xAccessToken || '',
    customerCode: getHeader(headers, 'customerCode') || old.customerCode || '',
    deviceToken: getHeader(headers, 'deviceToken') || old.deviceToken || '',
    cookie: getHeader(headers, 'Cookie') || old.cookie || '',
    version: getHeader(headers, 'version') || old.version || '4.1.7',
    os: getHeader(headers, 'os') || old.os || 'ios',
    modelType: getHeader(headers, 'modelType') || old.modelType || '0',
    systemVersion: getHeader(headers, 'systemVersion') || old.systemVersion || '',
    userAgent: getHeader(headers, 'User-Agent') || old.userAgent || '',
    updatedAt: new Date().toLocaleString()
  };

  if (auth.xAccessToken && auth.customerCode) {
    $persistentStore.write(JSON.stringify(auth), KEY);

    notify(
      '广汽本田登录态已更新',
      `Token过期: ${tokenExpireText(auth.xAccessToken)}`,
      `更新时间: ${auth.updatedAt}`
    );
  } else {
    console.log('未识别到完整登录态');
  }
} catch (e) {
  console.log('广汽本田登录态获取失败: ' + String(e));
}

$done({});