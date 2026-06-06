/*
中国移动权益签到 - 抓包

打开签到页一次即可
*/

const url = $request.url;

if (url.includes("appTokenLogin")) {

    const match = url.match(/\?(.*)$/);

    if (match) {

        $persistentStore.write(
            decodeURIComponent(match[1]),
            "CMCC_QWHD_LOGIN"
        );

        $notification.post(
            "中国移动权益",
            "",
            "登录参数保存成功"
        );
    }
}

$done({});
