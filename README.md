# 雾霾观察站 · Singapore Haze Watch

新加坡中英双语雾霾聚合看板（右上角切换 中文 / EN，或用 `?lang=en`；首次访问按浏览器语言自动选择）：五区空气质量地图、24/48 小时真实趋势、政府公告、相关新闻和生活指引。响应式布局，支持深色模式、区域选择、指标切换、新闻搜索和分类筛选。

## 页面结构

顶部是一条横跨整页的深色顶栏（滚动时固定）：左边是品牌，右边是 4 个标签和语言、深色模式、NEA 链接。顶栏下方左边是浅色的边栏：日期、当前标签的目录（点击跳到对应板块，滚动时高亮当前板块）、更新信息和数据来源。手机上没有边栏，品牌那一行会滚走，4 个标签那一行固定在屏幕顶端。标题、更新时间和全岛提醒条只在「现在」标签显示，数据过期等警告在所有标签都显示。目录由带 `data-toc` 属性的板块自动生成：

- **现在**（`#now`）：我的空气、四个指标、五区地图、变化趋势
- **预测与安排**（`#plan`）：空气预测（左上明日、左下之后几天与什么时候会变好，右边什么时候出门）、官方措施、周边城市
- **防护与求助**（`#protect`）：净化器计算器、防霾资源、健康建议
- **公告与新闻**（`#updates`）：政府公告、新闻动态

网址的 `#` 后面可以是标签名，也可以是任意板块的 id（如 `#escape`、`#guide`），会自动切到所在标签并滚动过去。地图在隐藏的标签里初始化时尺寸为 0，所以切回「现在」时会重新测量并重新定位。

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

## 和往年比较

`scripts/update_history.py` 随整点任务运行，生成 `public/data/history.json`（每年的最高 24 小时 PSI、日期和区域，以及超过 100/200/300 的天数，还有 2015、2019、2023 和今年 8–11 月的每日最高值）。每天的数值取五个区域中的最高读数，缓存在 `data/psi-daily.json`（不发布到网站）。数据来源按优先级：

1. NEA「Historical 24-hr PSI」数据集（`d_b4cf557f8750260d229c49fd768e11ed`，2014 年 4 月起，大约每月更新），最多每 7 天重新下载一次；
2. 数据集截止日之后、最近 8 天之前的日子，用实时 PSI 接口按日期补一次；
3. 最近 8 天和今天，用 `latest.json` 里已有的逐小时数据，每小时更新。

2014 年 4 月之前的 PSI 不含 PM2.5，当时的新闻数字多是 3 小时 PSI，所以 2013 年（3 小时 PSI 401，NEA）和 1997 年（3 小时 PSI 226，二手来源）只在表格下方单独注明，不参与排名。

## 官方措施

`public/rules.mjs` 列出各部门按 24 小时 PSI 分级触发的措施（MOE 中小学、ECDA 学前教育、MOM 雇主、SportSG 体育设施、PA 避霾中心），中英文各一份，只收录在各部门官方页面核实过的内容（核对日期写在 `checked`）。每条规定标明依据的是「次日预报」（MOE、SportSG）还是「当前读数」（ECDA、MOM、PA）。页面按当前最高读数和明日预报区间（优先用 NEA 官方区间；区间跨两档时两档都标出）高亮适用的一档。政策变化时需要手动更新这个文件。

## 出门时间与净化器计算器

- **什么时候出门**：`scripts/forecast.py` 在算明日预测时，把 CAMS 逐小时 PM2.5 按各区近 48 小时的 NEA 实测比值校正，从下一小时到明天 23 点写入 `forecast.hourly`。页面按区域（默认用户邮编所在区域）画出每小时柱状图，找出 6–21 点开始、平均最低的连续 2 小时作为最佳时段，并按 NEA 1 小时 PM2.5 分级（haze.gov.sg 的个人指引）给出健康人士和易感人群的建议。
- **空气净化器计算器**：纯前端，按 NEA 的公式估算所需烟雾 CADR：房间体积（m³）× 5，房间通风差时 × 7。输入已有净化器的 CADR 时，计算每小时换气次数，以及理想密闭房间内颗粒物降低 90% 所需时间（ln10 / 换气次数）。CADR 可以填 m³/h 或 CFM（1 CFM = 1.699 m³/h）。结果旁的曲线以当前户外最高的 1 小时 PM2.5 为起点，画出不开净化器、NEA 最低要求和已有净化器三种情况下室内 PM2.5 的变化：C(t) = C∞ + (C₀ − C∞)·e^(−(ACH+0.5)t)，其中 0.5 是关窗后典型住宅每小时从缝隙漏进的换气次数，C∞ = C₀·0.5 / (ACH+0.5) 是室内最终稳定的水平；并标出降到 55 µg/m³（NEA 正常范围）以下所需的分钟数。下方从 NEA「适用便携式空气净化器名单」中筛出够用的型号（带离子等电子净化的机型按综合 CADR × 7 判断），按 CADR 从小到大排列，附 Lazada 和 Shopee 的搜索链接查看实时价格。不抓取电商平台：Lazada 的商品数据由受反爬保护的接口加载，Shopee 的接口直接拒绝程序访问。

## 周边城市

`scripts/update_escape.py` 每小时（随整点任务）生成 `public/data/escape.json`：17 个周边城市（含新加坡作对照）现在的 AQI，以及明天和后天的最高 AQI。数据来自 Open-Meteo 的 CAMS 模式（`us_aqi_pm2_5`，美国标准，按 24 小时 PM2.5 计算；不用总 AQI，因为臭氧会把曼谷等城市拉高，和烟霾无关）。城市列表和大致飞行时间写在脚本的 `CITIES` 里。

机票：价格来自 Kiwi.com 官方公开的 MCP 服务器（`https://mcp.kiwi.com`，免费，不需要 key；脚本直接用 JSON-RPC 调用它的 `search-flight` 工具）。每个城市查明天单程经济舱 1 名成人的最低价，以及最便宜的直飞价；关闭了自助转机（`allow_self_transfer: false`），只算同一订单的行程。为了对这个免费服务客气一点，同一城市同一日期的价格 4 小时内不重复查询，查询之间间隔 1.5 秒，每天约 100 次。查询失败时保留同一天的旧价格。Trip.com、Google Flights 和 Skyscanner 的搜索链接保留作对照。Trip.com 和 Google 都用反机器人验证拦截自动访问，所以不从它们抓取。

## 防霾资源

`scripts/update_resources.py` 生成 `public/data/resources.json`，地图上的资源图层和「我的空气」里的「附近资源」都读这个文件：

- **N95 口罩发放机**：镜像政府 HazeMaskGoWhere 的数据文件（`gowhere.gov.sg/hazemask/data/data.webhook.json`），包含坐标、开放时间、库存（有货、少量、缺货）和机器是否运作。该文件不允许浏览器跨域读取，所以由服务器抓取。
- **民众俱乐部（CC）**：data.gov.sg 上 PA 的 Community Club 数据集（`d_9de02d3fb33d96da1855f4fbef549a0f`），只保留 `DESCRIPTION` 为 CC 的点。
- **综合诊所**：data.gov.sg 上 HPB 的筛查中心数据集（`d_3ca2a28059588f297908b32da4ac3cbe`），只保留名称含 Polyclinic 的点；数据是 2023 年的，新开的诊所可能没有。
- CC 和综合诊所每 7 天重新下载一次。只有内容变化时才重写文件，所以频繁运行也不会产生空提交。
- **NEA 适用净化器名单**：解析 NEA 页面上的表格（品牌型号、类别、滤网等级、烟雾 CADR），每 7 天检查一次，写入 `purifiers`。
- 派发资格、补贴和避霾中心的说明文字摘自 NEA 10 月 14 日的雾霾通报和 MOH 10 月 11 日的公告，政策有变化时需要手动更新 `public/locale.mjs`。

服务器上有两条 crontab：

```cron
5 * * * * /home/rainwangphy/singaporehaze2026/scripts/server_update.sh
*/15 * * * * /home/rainwangphy/singaporehaze2026/scripts/server_update.sh resources
```

第二条只刷新资源（主要是口罩库存）。两条共用同一个锁，不会同时运行。

## 地图与邮编查询

- 地图用 Leaflet 1.9.4（cdnjs，带 SRI 校验）加 OneMap 底图（深色模式用 Night 样式），须保留 OneMap 和 Singapore Land Authority 的署名。五区圆点画在 NEA PSI 接口 `regionMetadata` 给出的各区代表点上。Leaflet 加载失败时，回退为原来的示意图。
- 「我的空气」：用户输入邮编后，浏览器直接调用 OneMap 搜索接口（无需 key，允许跨域）取得坐标，再按距离最近的 NEA 区域代表点归属区域。NEA 不公布区域边界，所以这只是近似。邮编不会经过本站服务器；只有勾选“记住”时才保存在浏览器的 `localStorage`。也可以使用浏览器定位。

## 明日预测

`scripts/forecast.py` 由 `update_data.py` 每小时调用，结果写入 `latest.json` 的 `forecast`，同时把每天最后一次预测记入 `forecastLog`（保留 14 天），次日用实测读数核对命中情况（实测当日最高 24 小时 PSI 落在预测区间 ±10% 内即算命中）。综合四个来源，任何一个缺失时都会降级运行：

- **NEA 官方预报**：解析最新的 “Haze Situation Update” 中 “24-hr PSI Forecast: …” 的分级文字，按 NEA 分级换算为 PSI 区间（Low/Mid/High 取该级的三分之一），并摘录第 3 段的展望原文。只采用针对目标日期的预报，权重 60%。NEA 通常在傍晚约 18:20 发布。
- **CAMS 大气模式**：Open-Meteo 免费接口提供的五区 PM2.5 逐小时预报。用近 48 小时 NEA 实测值与模式之比做偏差校正（限制在 0.33–3 倍之间），再用 NEA 的 PM2.5 分指数换算成 PSI。
- **近期趋势**：当前读数加上过去 24 小时变化的一半。
- **NEA 四日天气展望**：有降雨时乘以 0.92，非偏南风时乘以 0.85，只作用于趋势估算（模式本身已包含气象条件）。

可信度：有官方预报且与本站估算区间重叠为“较高”；有官方预报但不重叠，或模式与趋势相差在 25% 以内为“中等”；其余为“较低”。

### 之后几天：什么时候会变好

写入 `forecast.longRange`：

- **逐日估算**：第一天用上面的综合区间；之后三天只用 CAMS（请求 5 天），每天的 PM2.5 均值乘以同一个偏差校正系数，再换算成 PSI，取五区最低到最高。每天附上 NEA 四日天气展望的天气和风向。`betterFrom` 是第一个最高值 ≤ 100 的日期；没有时，页面按首尾两天的最高值比较，判断为逐渐好转（降 15% 以上）、持平或加重。
- **ASMC 展望**：每 12 小时抓一次 ASEAN 专业气象中心（asmc.asean.org）首页。季节展望取 “Summary of Outlook” 中提到 haze 的段落，从措辞中识别“仍会偏重”（remain escalated / persist）和“何时可能缓解”（如 “towards the end of October … alleviate”），页面据此给出中英文结论，原文折叠显示。双周展望取首页链接的最新 “Subseasonal Weather Outlook” 中关于 southern ASEAN 和 next fortnight 的句子，识别偏干、偏湿或接近常年；展望期结束后不再显示。

## 故障排查

检查页面“数据来源与说明”、GitHub Actions 记录与 `/api/data` 的 `sources` / `errors`。`generatedAt` 表示采集时间；`psi.timestamp` / `pm25.timestamp` 表示官方观测时间；`publishedAt` 表示文章时间。源未提供文章时间时明确显示“媒体未提供发布时间”。不要以采集时间代替新鲜观测。

## 文案与翻译

所有界面文字在 `public/locale.mjs` 中按 key 维护中英两份；HTML 用 `data-i18n` / `data-i18n-attr` 标注，脚本用 `t('key', {变量})`。分级名称与健康建议的双语版本在 `public/lib.mjs`。新闻和 NEA 公告标题保留英文原文。
