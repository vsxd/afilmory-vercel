# iPhone 本机性能验证

这个入口把当前代码做成临时生产构建，在手机 Safari 中打开真实应用。默认使用已有的 18 张合成照片，不运行 Builder，不读取仓库 `.env`，不覆盖 `apps/web/dist` 或真实 manifest。

## 启动

在仓库根目录运行：

```sh
pnpm exec tsx scripts/device-check-server.ts --host 0.0.0.0
```

要用现有真实图库，显式加 `--real-library`：

```sh
pnpm exec tsx scripts/device-check-server.ts --host 0.0.0.0 --real-library
```

真实模式仅读取 `generated/photos-manifest.json` 和 `apps/web/public`；远程原图继续使用 manifest 已有地址。本地原图必须已经在 public 中，工具不会读取或复制其他照片源目录。它使用隔离的站点测试配置，关闭外部统计，不继承私有环境变量。

默认只监听 `127.0.0.1`，手机访问需显式 `--host 0.0.0.0`。默认端口 `4176`，可用 `--port 4177` 更改。构建完成后终端打印带随机 token 的入口链接及报告目录；使用其中 Mac 的局域网 IPv4 地址，不能在手机上用 `127.0.0.1`。

## 手机连接与操作

1. 优先让手机和 Mac 连接同一网络。不能同 Wi-Fi 时，开启 iPhone「个人热点」，让 Mac 连接它，保持热点开启。
2. 在 iPhone Safari 打开终端打印的 Mac 地址链接。若系统询问 Mac 是否允许 Node 的传入连接，允许本次本地验证。热点网络若不允许手机回连 Mac，保留这一结果，再处理正式发布；工具本身不会发布或建立公网隧道。
3. 等图库可见，点击顶部「开始」。滚动画廊约 20 秒；打开照片，缩放、切换几张并关闭约 30 秒；进入地图平移缩放约 20 秒；返回画廊。
4. 点击「结束」，填写 iPhone 型号、卡顿或刷新观察，然后「保存到 Mac」。不必填写照片信息。可重复一轮比较冷启动与再次访问。
5. Mac 终端打印报告保存路径和少量统计。完成后按 Ctrl+C：清理临时构建，保留 JSON 报告目录。带 token 的链接仅供本次验证，不要公开分享。

## 指标含义与限制

- 记录应用 iframe 内可见页面的 `requestAnimationFrame` 帧间隔，给出样本数、p50/p95/p99、最大值及超过 50/100 ms 的次数。分位数使用 nearest-rank。它反映帧回调节奏，不等于 GPU 绘制耗时，也不把 120 Hz 当作固定基准。
- 页面切到后台时跳过间隔，单独记录后台切换次数；最多记录 60,000 个间隔后自动结束。记录开始时的 iframe 视口、DPR 和浏览器 UA；机型由用户填写。
- 浏览器支持时记录 Long Tasks 的次数和时长；不支持时明确标为 `supported: false`，不是零卡顿。记录 WebGL context lost/restored、页面/资源 error 和未处理 Promise rejection 的次数，不保存错误文本或堆栈。
- 页面刷新会尽可能结束并保存当前内存统计；系统直接回收页面可能丢失该段数据。报告中的 reloads、缺失 metrics 和用户观察应一起判断。工具不能确认系统为何回收页面。
- 不声称测量 Safari 未开放的 JS heap、GPU 显存或系统内存。合成样例用于流程与回归检查，不能代表真实大图负载；验证大图请显式使用现有图库。
- 此入口禁用 Service Worker，确保每次导航都注入本次测量脚本；LAN HTTP 在 iPhone 上本来也不提供完整 PWA 能力。离线、HTTPS、正式 CDN 与安装后的 PWA 需要单独验收。iframe 外的控制面板占用少量屏幕高度，实际视口写入报告。
- 报告入口限制 20 KiB、验证随机 token 与字段白名单，文件只保存在 Mac 临时报告目录。自动采集不包含照片 URL、内容、EXIF、错误消息或秘密配置。

## 小型验证

```sh
pnpm exec vitest run --project scripts scripts/device-check-server.test.ts scripts/device-check-client.test.ts
```

这些测试使用很小的临时静态文件，验证路径/符号链接边界、SPA 回退、图片 MIME、视频 Range、报告认证和统计计算；另用模拟 DOM 验证后台间隔排除及错误只记录次数，不执行生产构建或启动浏览器。
