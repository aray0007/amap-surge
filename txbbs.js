/*
 * 微信提现免费券（Surge 单文件版）
 * - 作为 http-request 脚本运行：自动捕获 session-token
 * - 作为 cron/手动脚本运行：查询并领取每日免费提现券
 */

(function () {
  "use strict";

  const TOKEN_KEY = "wxtx.session-token";
  const UPDATED_AT_KEY = "wxtx.session-token.updated-at";
  const APPID = "wxdb3c0e388702f785";
  const DOMAIN = "https://discount.wxpapp.wechatpay.cn";
  const PAGE = "pages/gift/index";
  const PAGE_FRAME_VERSION = "208";
  const MODULE_NAME = "mmpaytxbbsmp";
  const SESSION_SCENE = "daily_reward";
  const USER_AGENT =
    "Mozilla/5.0 (Linux; Android 13; Mobile) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
    "Chrome/132.0.0.0 Mobile Safari/537.36 " +
    "MicroMessenger/8.0.50 NetType/WIFI Language/zh_CN " +
    "ABI/arm64 MiniProgramEnv/android";

  const requestMode =
    typeof $request !== "undefined" &&
    $request &&
    typeof $request === "object" &&
    $request.headers;

  if (requestMode) {
    captureToken();
  } else {
    claimDailyCoupon();
  }

  function headerValue(headers, targetName) {
    const wanted = targetName.toLowerCase();
    const key = Object.keys(headers || {}).find(
      (name) => name.toLowerCase() === wanted
    );
    return key ? String(headers[key] || "").trim() : "";
  }

  function captureToken() {
    const headers = $request.headers || {};
    const host = (
      headerValue(headers, ":authority") ||
      headerValue(headers, "host")
    ).toLowerCase();
    const isTarget =
      host === "discount.wxpapp.wechatpay.cn" ||
      String($request.url || "").indexOf("discount.wxpapp.wechatpay.cn") !== -1;
    const token = headerValue(headers, "session-token");

    if (!isTarget || !token) {
      $done({});
      return;
    }

    const previous = $persistentStore.read(TOKEN_KEY);
    if (previous !== token) {
      const saved = $persistentStore.write(token, TOKEN_KEY);
      $persistentStore.write(new Date().toISOString(), UPDATED_AT_KEY);
      if (saved) {
        $notification.post(
          "微信提现免费券",
          "登录凭据已更新",
          "session-token 已安全保存，可手动运行领券脚本。"
        );
      } else {
        $notification.post(
          "微信提现免费券",
          "保存失败",
          "Surge 未能写入 session-token。"
        );
      }
    }
    $done({});
  }

  function claimDailyCoupon() {
    let finished = false;

    function finish(subtitle, message) {
      if (finished) return;
      finished = true;
      console.log(`[微信提现免费券] ${subtitle}: ${message}`);
      $notification.post("微信提现免费券", subtitle, message);
      $done();
    }

    function randomChars(alphabet, length) {
      let output = "";
      for (let index = 0; index < length; index += 1) {
        output += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      return output;
    }

    function makeTrackId() {
      return `T${randomChars("0123456789ABCDEF", 31)}`;
    }

    function makeSessionId() {
      const randomPart = randomChars(
        "abcdefghijklmnopqrstuvwxyz0123456789",
        10
      );
      return `${SESSION_SCENE}-${Date.now()}-${randomPart}`;
    }

    function makeHeaders(trackId, token, sessionId) {
      const headers = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        "X-Page": PAGE,
        "X-Track-Id": trackId,
        xweb_xhr: "1",
        "X-Module-Name": MODULE_NAME,
        "X-Appid": APPID,
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        Referer: `https://servicewechat.com/${APPID}/${PAGE_FRAME_VERSION}/page-frame.html`,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "session-token": token,
      };
      if (sessionId) headers["session-id"] = sessionId;
      return headers;
    }

    function parseResponse(error, response, data, action) {
      if (error) throw new Error(`${action}网络错误：${String(error)}`);
      const status = response && Number(response.status);
      if (status && (status < 200 || status >= 300)) {
        throw new Error(`${action}返回 HTTP ${status}`);
      }

      let payload;
      try {
        payload = JSON.parse(data || "{}");
      } catch (_parseError) {
        throw new Error(`${action}返回的不是 JSON`);
      }
      if (!payload || typeof payload !== "object") {
        throw new Error(`${action}返回格式异常`);
      }
      if (payload.errcode !== 0) {
        const message = payload.msg || payload.message || "未知错误";
        throw new Error(`${action}失败：${payload.errcode} ${message}`);
      }
      return payload.data && typeof payload.data === "object"
        ? payload.data
        : {};
    }

    function couponInfo(coupon) {
      return coupon &&
        coupon.coupon_info &&
        typeof coupon.coupon_info === "object"
        ? coupon.coupon_info
        : {};
    }

    function couponName(coupon) {
      const info = couponInfo(coupon);
      return info.name || `coupon_id=${String(info.coupon_id || "未知")}`;
    }

    function couponAmount(coupon) {
      const amount = couponInfo(coupon).face_value;
      if (!Number.isInteger(amount)) return "未知额度";
      return amount % 100 === 0
        ? `${amount / 100}元`
        : `${(amount / 100).toFixed(2)}元`;
    }

    function queryCoupons(token, trackId, callback) {
      $httpClient.get(
        {
          url: `${DOMAIN}/txbbs-mall/coupon/querydailygiftcoupons`,
          headers: makeHeaders(trackId, token),
          timeout: 15,
          "auto-cookie": false,
        },
        (error, response, data) => {
          try {
            const result = parseResponse(
              error,
              response,
              data,
              "查询每日额度"
            );
            const items = result.coupon_items;
            if (!Array.isArray(items)) {
              throw new Error("查询返回缺少 coupon_items");
            }
            callback(
              null,
              items.filter((item) => item && typeof item === "object")
            );
          } catch (requestError) {
            callback(requestError);
          }
        }
      );
    }

    function claimCoupon(token, trackId, coupon, callback) {
      const info = couponInfo(coupon);
      const couponId = info.coupon_id;
      const amount = info.face_value;
      const giftType = coupon.daily_gift_type;

      if (!Number.isInteger(couponId)) {
        callback(new Error("券缺少 coupon_id"));
        return;
      }
      if (!Number.isInteger(amount)) {
        callback(new Error("券缺少 face_value"));
        return;
      }
      if (typeof giftType !== "string" || !giftType) {
        callback(new Error("券缺少 daily_gift_type"));
        return;
      }

      $httpClient.post(
        {
          url: `${DOMAIN}/txbbs-mall/coupon/claimdailygiftcoupon`,
          headers: makeHeaders(trackId, token, makeSessionId()),
          body: {
            daily_gift_type: giftType,
            coupon_id: couponId,
            expected_send_amount: amount,
          },
          timeout: 15,
          "auto-cookie": false,
        },
        (error, response, data) => {
          try {
            parseResponse(error, response, data, "领取每日额度");
            callback(null);
          } catch (requestError) {
            callback(requestError);
          }
        }
      );
    }

    const token = String($persistentStore.read(TOKEN_KEY) || "").trim();
    if (!token) {
      finish("未找到登录凭据", "请启用 MITM 后打开一次“提现笔笔省”小程序。 ");
      return;
    }

    const trackId = makeTrackId();
    queryCoupons(token, trackId, (queryError, coupons) => {
      if (queryError) {
        finish("执行失败", queryError.message || String(queryError));
        return;
      }

      const available = coupons.find((coupon) => {
        const info = couponInfo(coupon);
        return !coupon.is_claimed && Number.isInteger(info.coupon_id);
      });

      if (!available) {
        const claimed = coupons.find((coupon) => coupon.is_claimed);
        if (claimed) {
          finish(
            "今日已领取",
            `${couponName(claimed)}，当前额度 ${couponAmount(claimed)}`
          );
        } else {
          finish("暂无可领取额度", "没有查询到未领取的每日免费券。 ");
        }
        return;
      }

      claimCoupon(token, trackId, available, (claimError) => {
        if (claimError) {
          finish("领取失败", claimError.message || String(claimError));
          return;
        }
        finish(
          "领取成功",
          `${couponName(available)}，到账额度 ${couponAmount(available)}`
        );
      });
    });
  }
})();
