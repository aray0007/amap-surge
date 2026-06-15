const removeTitles = ["多多视频", "点我领券", "点击领券"];

let body = $response.body;
try {
    let obj = JSON.parse(body);
    if (obj.success && obj.result) {
        if (Array.isArray(obj.result.bottom_tabs)) {
            obj.result.bottom_tabs = obj.result.bottom_tabs.filter(
                tab => !removeTitles.includes(tab.title)
            );
        }
        if (Array.isArray(obj.result.buffer_bottom_tabs)) {
            obj.result.buffer_bottom_tabs = obj.result.buffer_bottom_tabs.filter(
                tab => !removeTitles.includes(tab.title)
            );
        }
    }
    body = JSON.stringify(obj);
} catch (e) {}

$done({ body });