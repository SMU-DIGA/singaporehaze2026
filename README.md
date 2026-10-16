# 雾霾观察站 · Singapore Haze Watch

新加坡中英双语雾霾聚合看板（右上角切换 中文 / EN，或用 `?lang=en`；首次访问按浏览器语言自动选择）：五区空气质量地图、24/48 小时真实趋势、政府公告、相关新闻和生活指引。响应式布局，支持深色模式、区域选择、指标切换、新闻搜索和分类筛选。

## 运行

无需安装依赖。Node.js 22+，Python 3.10+。

```bash
npm run update    # 抓取真实数据；需要网络
npm run dev       # http://localhost:8000
npm test          # 分级边界、安全、过期判断、分页和故障保留测试
npm run build     # 生成静态网页与 Sites Worker
node scripts/validate-artifact.mjs
```

## 官方与新闻来源

- NEA / data.gov.sg：`https://api-open.data.gov.sg/v2/real-time/api/psi`、`/pm25`。按官方五区呈现 24 小时 PSI、1 小时 PM2.5，历史接口按日期和分页抓取。
- NEA 政府公告：官方网页使用的 `https://www.nea.gov.sg/media/news/GetData/1/0/0/haze` JSON 接口。仅保留标题、日期、出处和原文链接。
- CNA 雾霾专题：`https://www.channelnewsasia.com/topic/haze`，直达媒体文章。Python 采集器也通过 Google News RSS 获取可信媒体标题。
- MOM 工作指引、NEA 健康与室内空气指引、ASMC 火点和跨境烟霾监测。

地图为区域定位示意，不表示街道测量、行政边界或浓度插值。PSI 与 PM2.5 使用各自 NEA 分级。健康提示为官方指引中文摘要，活动建议按五区最高观测 PSI 呈现，明确区分观测与预测。所有用户可见时间使用 Asia/Singapore。

## 上线架构

`.openai/hosting.json` 保留 Sites 身份及 R2 `BUCKET` 绑定。`scripts/build.mjs` 将 `public/` 资源嵌入独立 ESM Worker，服务网页及数据 API，不依赖 GitHub 仓库公开访问。

- `GET /api/data`：读取 R2 持久化快照；尚未写入时使用内置的有效初始快照。
- `POST /api/refresh`：服务器抓取空气数据、历史数据、NEA 公告和 CNA 新闻，写入 R2。更新不重新发布网站。五分钟内重复调用幂等返回。
- 源不可用时保留上次有效内容并记录失败；关键空气源失败返回 HTTP 502，同时保留可读数据。网页显示来源失败和超过四小时的过期提示。

站点默认保持 owner-private。更新接口依赖 Sites 的访问控制边界，仅站点拥有者或平台服务凭证可访问。不要把此接口直接公开；若未来公开网站，必须先为写接口添加独立授权。

## 定时更新

1. **上线站点**：关联的 Sites 云任务按新加坡时间每三小时执行 `POST /api/refresh`，随后 `GET /api/data` 核实 `persistedAt` 一致。任务通过 `get_site` 在运行时取得 Sites 支持的服务凭证，源代码和任务提示中不保存凭证。站点关闭时也会更新。
2. **GitHub 数据存档**：GitHub 定时任务经常延迟或跳过，已停用。改由服务器 crontab 每小时第 5 分钟（新加坡时间，NEA 整点发布读数之后）运行 `scripts/server_update.sh`：同步 `origin/main`，执行 `scripts/update_data.py` 和 Python 测试，有变化时提交 `public/data/latest.json` 并 push（日志在 `logs/server_update.log`，用 `flock` 防止重叠运行；可在 `.env` 中设置 `DATA_GOV_SG_API_KEY` 提高官方 API 限额）。push 会触发 `.github/workflows/update.yml` 的 `deploy` 任务，把 `public/` 作为网站根目录发布到 GitHub Pages（Settings → Pages → Source 需设为 “GitHub Actions”），网址为 https://smu-diga.github.io/singaporehaze2026/ ，旧的 `/public/` 链接会自动跳转。在 Actions 页面手动运行该 workflow 仍会在 GitHub 上采集一次。网页同时读取站点内的快照和 `raw.githubusercontent.com` 上的最新快照，取较新者，因此即使 Pages 构建延迟也能显示最新数据；页面打开期间每 15 分钟检查一次。

   ```cron
   5 * * * * /home/rainwangphy/singaporehaze2026/scripts/server_update.sh
   ```

云端计划任务和 GitHub Actions 可能排队延迟。上线站点使用独立 Sites 任务，不依赖此存档任务。GitHub 数据提交不会重新发布 Sites 代码。

首次发布后使用 `scripts/verify_hosted.py <站点地址>`，从隐藏 stdin 输入平台服务 token，执行写入和持久化回读验证。脚本不会保存或打印 token。

## 明日预测

`scripts/forecast.py` 由 `update_data.py` 每小时调用，结果写入 `latest.json` 的 `forecast`，同时把每天最后一次预测记入 `forecastLog`（保留 14 天），次日用实测读数核对命中情况（实测当日最高 24 小时 PSI 落在预测区间 ±10% 内即算命中）。综合四个来源，任何一个缺失时都会降级运行：

- **NEA 官方预报**：解析最新的 “Haze Situation Update” 中 “24-hr PSI Forecast: …” 的分级文字，按 NEA 分级换算为 PSI 区间（Low/Mid/High 取该级的三分之一），并摘录第 3 段的展望原文。只采用针对目标日期的预报，权重 60%。NEA 通常在傍晚约 18:20 发布。
- **CAMS 大气模式**：Open-Meteo 免费接口提供的五区 PM2.5 逐小时预报。用近 48 小时 NEA 实测值与模式之比做偏差校正（限制在 0.33–3 倍之间），再用 NEA 的 PM2.5 分指数换算成 PSI。
- **近期趋势**：当前读数加上过去 24 小时变化的一半。
- **NEA 四日天气展望**：有降雨时乘以 0.92，非偏南风时乘以 0.85，只作用于趋势估算（模式本身已包含气象条件）。

可信度：有官方预报且与本站估算区间重叠为“较高”；有官方预报但不重叠，或模式与趋势相差在 25% 以内为“中等”；其余为“较低”。

## 故障排查

检查页面“数据来源与说明”、GitHub Actions 记录与 `/api/data` 的 `sources` / `errors`。`generatedAt` 表示采集时间；`psi.timestamp` / `pm25.timestamp` 表示官方观测时间；`publishedAt` 表示文章时间。源未提供文章时间时明确显示“媒体未提供发布时间”。不要以采集时间代替新鲜观测。

## 文案与翻译

所有界面文字在 `public/locale.mjs` 中按 key 维护中英两份；HTML 用 `data-i18n` / `data-i18n-attr` 标注，脚本用 `t('key', {变量})`。分级名称与健康建议的双语版本在 `public/lib.mjs`。新闻和 NEA 公告标题保留英文原文。
