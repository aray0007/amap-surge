/*
中国移动权益签到
*/

const login = $persistentStore.read("CMCC_QWHD_LOGIN");

if (!login) {
    $notification.post(
        "中国移动权益",
        "",
        "未获取登录参数"
    );
    $done();
}

const loginUrl =
    "https://wx.10086.cn/qwhdsso/appTokenLogin?" + login;

function getDate() {
    const d = new Date();

    const y = d.getFullYear();

    const m = String(
        d.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        d.getDate()
    ).padStart(2, "0");

    return `${y}${m}${day}`;
}

$httpClient.get(loginUrl, function (err, resp) {

    if (err) {

        $notification.post(
            "中国移动权益",
            "",
            "获取Token失败"
        );

        return $done();
    }

    const cookie =
        resp.headers["Set-Cookie"] ||
        resp.headers["set-cookie"];

    const tokenMatch = cookie.match(
        /QWHD_SESSION_TOKEN=([^;]+)/
    );

    if (!tokenMatch) {

        $notification.post(
            "中国移动权益",
            "",
            "Token解析失败"
        );

        return $done();
    }

    const token = tokenMatch[1];

    const headers = {
        "Content-Type":
            "application/json;charset=UTF-8",
        Cookie:
            "QWHD_SESSION_TOKEN=" + token
    };

    const body = JSON.stringify({
        date: getDate()
    });

    $httpClient.post(
        {
            url:
                "https://wx.10086.cn/qwhdhub/api/mark/mark31/domark",
            headers,
            body
        },
        function (err, resp, data) {

            if (err) {

                $notification.post(
                    "中国移动权益",
                    "",
                    "签到失败"
                );

                return $done();
            }

            try {

                const result =
                    JSON.parse(data);

                if (
                    result.code ===
                    "SUCCESS"
                ) {

                    $notification.post(
                        "中国移动权益",
                        "",
                        "签到成功"
                    );
                } else {

                    $notification.post(
                        "中国移动权益",
                        "",
                        data
                    );
                }

            } catch {

                $notification.post(
                    "中国移动权益",
                    "",
                    data
                );
            }

            $done();
        }
    );
});
