# 雾霾观察站 · Singapore Haze Watch

新加坡中文雾霾聚合看板：五区空气质量地图、24/48 小时真实趋势、政府公告、相关新闻和生活指引。响应式布局，支持深色模式、区域选择、指标切换、新闻搜索和分类筛选。

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

## 每三小时更新

1. **上线站点**：关联的 Sites 云任务按新加坡时间每三小时执行 `POST /api/refresh`，随后 `GET /api/data` 核实 `persistedAt` 一致。任务通过 `get_site` 在运行时取得 Sites 支持的服务凭证，源代码和任务提示中不保存凭证。站点关闭时也会更新。
2. **GitHub 数据存档**：`.github/workflows/update.yml` 使用 `17 1-23/3 * * *`（UTC），对应 SGT 每日 00:17、03:17、06:17、09:17、12:17、15:17、18:17、21:17，采集后提交 `public/data/latest.json`。支持手动执行，初次推送会触发。默认 `GITHUB_TOKEN` 需要 contents:write；可选 secret `DATA_GOV_SG_API_KEY` 用于提高官方 API 限额。

云端计划任务和 GitHub Actions 可能排队延迟。GitHub 公共仓库的长期无活动可能暂停 scheduled workflows；上线站点使用独立 Sites 任务，不依赖此存档任务。GitHub 数据提交不会重新发布 Sites 代码。

首次发布后使用 `scripts/verify_hosted.py <站点地址>`，从隐藏 stdin 输入平台服务 token，执行写入和持久化回读验证。脚本不会保存或打印 token。

## 故障排查

检查页面“数据来源与说明”、GitHub Actions 记录与 `/api/data` 的 `sources` / `errors`。`generatedAt` 表示采集时间；`psi.timestamp` / `pm25.timestamp` 表示官方观测时间；`publishedAt` 表示文章时间。源未提供文章时间时明确显示“媒体未提供发布时间”。不要以采集时间代替新鲜观测。
