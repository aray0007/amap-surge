/**
 * 拼多多精简底栏
 * 去除「多多视频」和「点我领券」
 * 
 * Quantumult X 脚本
 * rewrite: https:\/\/api\.pinduoduo\.com\/api\/alexa\/homepage\/hub url script-response-body pdd_bottom_tab.js
 */

const removeTitles = ["多多视频", "点我领券", "点击领券"];

let body = $response.body;
try {
    let obj = JSON.parse(body);
    if (obj.success && obj.result) {
        // 过滤 bottom_tabs
        if (Array.isArray(obj.result.bottom_tabs)) {
            obj.result.bottom_tabs = obj.result.bottom_tabs.filter(
                tab => !removeTitles.includes(tab.title)
            );
        }
        // 过滤 buffer_bottom_tabs
        if (Array.isArray(obj.result.buffer_bottom_tabs)) {
            obj.result.buffer_bottom_tabs = obj.result.buffer_bottom_tabs.filter(
                tab => !removeTitles.includes(tab.title)
            );
        }
    }
    body = JSON.stringify(obj);
} catch (e) {
    // 解析失败则原样返回
}

$done({ body });
