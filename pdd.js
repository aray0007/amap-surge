let body = $response.body || "";
let url = $request.url || "";

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

function emptyLike(x) {
  if (Array.isArray(x)) return [];
  if (isObj(x)) return {};
  if (typeof x === "number") return 0;
  if (typeof x === "boolean") return false;
  if (typeof x === "string") return "";
  return null;
}

function stripGoodsDecor(d) {
  if (!isObj(d)) return d;
  delete d.ad;
  d.need_ad_logo = false;
  d.icon = null;
  d.icon_list = [];
  d.label_list = [];
  d.tag_list = [];
  d.personalize_tag_list = [];
  d.special_tag_info = null;
  d.tag_style = 0;
  if (typeof d.link_url === "string") {
    d.link_url = d.link_url
      .replace(/([?&])_oc_adinfo=[^&]*/g, "$1")
      .replace(/([?&])_oc_refer_ad=[^&]*/g, "$1")
      .replace(/[?&]$/g, "");
  }
  if (d.track_info && d.track_info.p_rec) {
    d.track_info.p_rec.tag_list_track = [];
    d.track_info.p_rec.icon_list_track = [];
  }
  return d;
}

function isAdGoods(item) {
  let d = item && item.data ? item.data : item;
  if (!isObj(d)) return false;
  let link = String(d.link_url || "");
  if (d.ad) return true;
  if (d.need_ad_logo === true) return true;
  if (/_oc_(adinfo|refer_ad)=|ads_from|ad_id/i.test(link)) return true;
  return false;
}

function stripHub(obj) {
  try {
    if (obj.data && Array.isArray(obj.data.goods_list)) {
      obj.data.goods_list = obj.data.goods_list
        .filter(item => !isAdGoods(item))
        .map(item => {
          let d = item && item.data ? item.data : item;
          stripGoodsDecor(d);
          return item;
        });
    }
  } catch (e) {}
  return obj;
}

function emptyGoodsRecommend(obj) {
  // 用于首页/个人中心商品推荐流：返回空列表，避免继续下拉推荐
  if (obj.has_more !== undefined) obj.has_more = false;
  if (obj.data && Array.isArray(obj.data.goods_list)) obj.data.goods_list = [];
  if (obj.data && Array.isArray(obj.data.list)) obj.data.list = [];
  if (Array.isArray(obj.goods_list)) obj.goods_list = [];
  if (Array.isArray(obj.list)) obj.list = [];
  if (obj.org) obj.org = {};
  return obj;
}

function stripPopup(obj) {
  obj.list = [];
  obj.rm_id_list = [];
  obj.rm_close_list = [];
  obj.invalid_module_list = [];
  return obj;
}

function stripSplash(obj) {
  return { splash_list: [], size: 0 };
}

function stripGather(obj) {
  // 底部券条/新人券/运营位
  if (obj.newer_index_banner) {
    obj.newer_index_banner.valid_data = false;
    obj.newer_index_banner.dy_template = {};
    obj.newer_index_banner.data = {};
  }
  if (obj.push_banner) obj.push_banner = {};
  return obj;
}

function isBadNav(x) {
  try {
    let s = JSON.stringify(x).toLowerCase();
    return /多多视频|提前优惠|duoduoshipin|duoduo_video|video_tab|short_video|618/.test(s);
  } catch (e) { return false; }
}

function stripVideo618Deep(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.filter(x => !isBadNav(x)).map(stripVideo618Deep);
  for (let k of Object.keys(data)) {
    let lk = k.toLowerCase();
    if (/^(icon|icon_list|label_list|tag_list|personalize_tag_list|special_tag_info)$/.test(lk)) {
      data[k] = Array.isArray(data[k]) ? [] : null;
      continue;
    }
    if (/tag.*track|icon.*track/i.test(k)) {
      data[k] = [];
      continue;
    }
    if (isBadNav(data[k])) {
      data[k] = emptyLike(data[k]);
      continue;
    }
    data[k] = stripVideo618Deep(data[k]);
  }
  return data;
}

function stripPrefetch(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(x => {
    let s = JSON.stringify(x).toLowerCase();
    return !/duoduoshipin|vlayer_tab_popup|video|lupus|618|activity|promotion/.test(s);
  });
}

function stripRedDots(obj) {
  try {
    let s = JSON.stringify(obj).replace(/"number"\s*:\s*\d+/g, '"number":0').replace(/"tab_number"\s*:\s*\d+/g, '"tab_number":0');
    return JSON.parse(s);
  } catch (e) { return obj; }
}

let obj = safeParse(body);
if (obj) {
  if (/\/api\/cappuccino\/splash/i.test(url)) {
    obj = stripSplash(obj);
  } else if (/\/api\/aquarius\/hungary\/global\/(app_popup|chat)/i.test(url)) {
    obj = stripPopup(obj);
  } else if (/\/api\/alexa\/cells\/hub\/v3/i.test(url)) {
    // 去除商品推荐：这个接口就是首页/个人中心瀑布流推荐
    obj = emptyGoodsRecommend(obj);
  } else if (/\/proxy\/api\/api\/pdd-fe-performance-group\/app-prefetch/i.test(url)) {
    obj = stripPrefetch(obj);
  } else if (/\/api\/growth\/nagato\/app\/index\/gather/i.test(url)) {
    obj = stripGather(obj);
    obj = stripVideo618Deep(obj);
  } else if (/\/api\/philo\/personal\/center\/tab|\/api\/light\/live_tab\/query\/live_red_dot/i.test(url)) {
    obj = stripRedDots(obj);
    obj = stripVideo618Deep(obj);
  } else {
    obj = stripVideo618Deep(obj);
  }
  body = JSON.stringify(obj);
}

$done({ body });