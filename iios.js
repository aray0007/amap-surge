/*
 * iios.ga 多账号签到脚本
 *
 * 适用方式：在支持真实 WebView/Safari 环境的自动化里打开 https://www.iios.ga/#/login 后注入执行。
 * 说明：该站 API 直连会被 Cloudflare 拦截，脚本采用页面自动化方式登录并点击签到。
 */

const IIOS_ACCOUNTS = [
  { email: '12333456@qq.com', password: 'Aa12345600' },
  { email: '1233345@qq.com', password: '12345600' },
  { email: '12333455@qq.com', password: 'Aa12345600' },
  { email: '12333454@qq.com', password: 'Aa12345600' },
];

const IIOS_BASE = 'https://www.iios.ga/';
const WAIT_MS = 900;

function wait(ms = WAIT_MS) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function byText(text, selector = '*') {
  return Array.from(document.querySelectorAll(selector)).find(el => {
    return (el.innerText || el.textContent || '').trim() === text;
  });
}

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function gotoHash(hash) {
  if (!location.href.startsWith(IIOS_BASE)) {
    location.href = IIOS_BASE + '#/' + hash.replace(/^#?\/?/, '');
  } else {
    location.hash = '#/' + hash.replace(/^#?\/?/, '');
  }
  await wait(1300);
}

async function logoutIfNeeded() {
  await gotoHash('me');
  if (!document.body.innerText.includes('账号设置')) return;

  byText('账号设置')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait();

  byText('退出登录')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(500);

  byText('确认', 'button')?.click();
  await wait(1200);
}

async function login(account) {
  await gotoHash('login');

  const emailInput = document.querySelector('input[name="email"], input[type="email"]');
  const passwordInput = document.querySelector('input[name="password"], input[type="password"]');
  const loginButton = byText('提交登录', 'button');

  if (!emailInput || !passwordInput || !loginButton) {
    throw new Error('未找到登录表单，请确认页面已打开并加载完成');
  }

  setInput(emailInput, account.email);
  setInput(passwordInput, account.password);
  loginButton.click();
  await wait(1800);

  if (!localStorage.getItem('token')) {
    throw new Error('登录失败：未获取到 token，可能是账号密码错误或站点风控');
  }
}

async function signIn() {
  await gotoHash('points');

  const signText = byText('立即签到');
  const signCard = signText?.closest('.yjmyftju') || signText?.parentElement;
  if (!signCard) throw new Error('未找到“立即签到”按钮');

  signCard.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  await wait(1800);

  const pageText = document.body.innerText;
  const notify = Array.from(document.querySelectorAll('.rv-notify, .rv-toast, .rv-dialog, [class*="notify"], [class*="toast"]'))
    .map(el => (el.innerText || el.textContent || '').trim())
    .filter(Boolean)
    .join(' | ');

  return notify || (pageText.includes('已签到') ? '已签到' : '已点击签到，请查看页面提示');
}

async function runIiosSign(accounts = IIOS_ACCOUNTS) {
  const results = [];

  for (const account of accounts) {
    const result = { email: account.email, ok: false, message: '' };
    try {
      await logoutIfNeeded();
      await login(account);
      result.message = await signIn();
      result.ok = true;
    } catch (error) {
      result.message = error.message || String(error);
    }
    results.push(result);
    console.log(`[iios] ${result.email}: ${result.ok ? 'OK' : 'FAIL'} - ${result.message}`);
  }

  console.table(results);
  return results;
}

runIiosSign();
