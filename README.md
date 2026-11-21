# 葡萄园微气候群落识别

砾岚酒庄的田间勘测册。用地块昼夜温湿度识别微气候群落，按生效标签排滴灌，把采前糖度回链到当时的灌溉轮次和标签版本。

## 田间工作

砾岚酒庄是虚构的六地块酒庄，共约 9.3 公顷。田间记录员过去用探头导出的 CSV 对账，灌溉主管通过共享表安排滴灌，酿造组另外登记果粒糖度。三个常见问题是掉线探头的空班没有被识别、群落变化后旧时长仍留在排程里、观察记录找不到当时的标签依据。系统接收探头转录和现场巡查数据，发布群落标签及滴灌排程，并将已完灌轮次与采前抽样交给酿造组查阅。

| 账号 | 岗位 | 页面和权限 |
|---|---|---|
| `operator` | 田间记录员 | 建档和补采、提交模型、排灌和改排、登记完灌与采收观察 |
| `supervisor` | 灌溉主管 | 拥有记录员权限，可签核或退回候选标签、取消轮次、查审计 |
| `viewer` | 酿造查看岗 | 查看四个业务页，可追溯拟合证据、标签与采收记录 |

三个演示账号的密码均为 `Vineyard271!`。仪表与表单使用中国标准时间（UTC+08:00）。

### 2026 年 11 月 21 日的演示剧本

1. 06:30 核对 `wx-20261114.csv` 的六地块基线。北坡旧藤 `V-02` 生效标签为凉湿 v1。
2. 06:35 给北坡排 `IR-1121A`，原定 07:00 开始，滴灌 20 分钟。
3. 06:40 提交 `2026-11-20` 截止窗口。`WX-306` 缺 11 月 19、20 日两笔夜间采样，覆盖 4/6，阻断更新。
4. 06:45 用 `wx-recheck-1121.csv` 补入 11 月 20 日夜间的 20.2 °C、54% RH，覆盖达到 5/6。再次发起识别。
5. 06:48 后台选出三个群落，北坡候选由凉湿转为暖干。旧标签仍生效，排定轮次暂缓执行。
6. 06:55 灌溉主管核验备用探头并填写确认理由，北坡生效标签变为暖干 v2，旧轮次被标为待改排。
7. 08:20 按新标签重新编排 50 分钟，09:15 登记完灌。原定时长与标签依据保留在轮次账及审计中。
8. 10:30 酿造组请记录员从北坡三行抽取 50 粒，录入 23.1 °Bx，观察单关联 `IR-1121A` 和暖干 v2。

## 启动

```bash
cp .env.example .env
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build --wait
# 可选。启动默认已经初始化并入队首个完整采样窗口。
docker compose --env-file .env exec -T backend python -m backend.scripts.seed_demo
```

| 入口 | 地址 |
|---|---|
| 浏览器 | `http://127.0.0.1:18270/` |
| FastAPI OpenAPI 界面 | `http://127.0.0.1:19270/docs` |
| PostgreSQL | `127.0.0.1:17770`，库名与用户均为 `vineyard` |

Docker 服务为 `frontend`、`backend`、`worker`、`db`、`redis`。数据库、Redis 日志和拟合证据各使用独立命名卷。三个公开端口只映射到本机回环地址。`docker compose --env-file .env down` 保留卷。确需删除本地运行数据时可加 `-v --remove-orphans`。

本地开发可先在 Docker 中启动 `db`、`redis`，再在 Python 3.12 环境安装 `backend/requirements.txt`。将 `DATABASE_URL` 指向本机映射的数据库，将 `REDIS_URL` 指向可访问的开发 Redis，另设置 `JWT_SECRET`、`SEED_DEMO`、`EVIDENCE_DIR`。从项目根目录分别运行 `uvicorn backend.src.app:app --port 8000` 和 `python -m backend.src.worker`。前端需要经同源 `/api/` 去前缀代理到本地 FastAPI，可用 Compose 的 Nginx 配置作为开发代理参考。Compose 默认 Redis 使用内部地址 `redis:6379`。

| `.env` | 用途 |
|---|---|
| `COMPOSE_PROJECT_NAME` | Compose 项目/容器名前缀 |
| `FRONTEND_PORT`、`BACKEND_PORT`、`DB_PORT` | 三个宿主机入口 |
| `POSTGRES_PASSWORD` | 数据库密码，容器连接使用同一值 |
| `JWT_SECRET` | 六小时 JWT 的 HS256 签名密钥 |
| `SEED_DEMO` | `true` 自动初始化固定场景；手工 seed 仍可运行 |

## 群落口径与版本

连续三日每天应有昼夜各一笔。任一地块少于 5/6 笔时保留生效标签，记录缺口、原始读数快照与 SHA-256。每个地块以日均温、夜均温、日均相对湿度、夜均相对湿度四维表示。后台标准化后，用对角协方差 GaussianMixture 拟合 1–3 组，依据 `BIC = p log(n) − 2 log(L)` 的最小值选组数。固定随机种子 `1071`，`n_init=10`，`reg_covar=0.025`。按标准化中心的日夜温度之和减日夜湿度之和，从凉湿向暖干排序。保存候选 BIC、后验概率、原尺度中心、参数与输入指纹。相同已发布快照返回原批次，失败批次可按原快照重试。

标签候选只在变更影响已排轮次时进入主管台。确认与标记待改排在同一事务提交。凉湿、温和、暖干对应预设的 20、35、50 分钟。改排保留最初版本引用，审计附前后版本、时段与时长。录入采收观察要求轮次已完灌、时间相符且每轮仅一笔。三类标签和滴灌时长是基于合成观测的演示规则。传感器和执行设备通过人员录入与登记协作。

## 试种地与试判

- **建档即试种**：新租地块登记后 `lifecycle` 为 `trial`，在坡畦图上以虚线边界区分。试种地块没有生效标签，不能安排滴灌；只有主管可在地块页执行转正（`POST /blocks/{id}/promote`），转正后身份变为 `official`。
- **读数不参与拟合**：识别批次的采样快照只纳入正式地块，因此试种地的读数不会改变 GaussianMixture 的拟合结果，也不影响六地块最小样本与覆盖阻断口径。
- **试判复用已生效模型**：群落页对试种地发起试判（`POST /blocks/{id}/trial-judgments`）时，后台取出当前已生效批次随证据留存的完整模型参数（标准化器、权重、均值、对角协方差、组件→群落映射），对该地块三日六笔读数执行一次 E-step 后验计算，不重新拟合。缺测超过 25% 同样阻断。
- **重试不新增记录**：每块试种地只有一行 `trial_judgment`。再次试判在原行上覆盖结论、`attempts` 加一，旧结论连同其基准批次号压入 `history` 留查；前端试判留痕表保留全部版本。
- **新基准使旧试判过期**：主管发布新模型（新的 effective 批次）时，其他基准批次下状态为 `current` 的试判自动置为 `expired`，记录本身保留。过期试判必须以不早于新基准窗口的读数重算，重算后恢复 `current`；转正时试判行置为 `archived`。
- **转正与拟合排队**：若转正时已有 `queued` 批次，该批次快照在入队时已冻结，沿用原地块名单；转正后新提交的批次才把该地块计入拟合。排灌仍以生效 `climate_label` 为准，试判结论不产生标签。

## 代码职责

| 路径 | 说明 |
|---|---|
| `backend/migrations/001_field_ledger.sql` | 领域表、外键、版本和活动状态约束 |
| `backend/migrations/002_trial_blocks.sql` | 地块试种/正式身份与试判记录表 |
| `backend/src/schemas.py`、`backend/src/domain.py` | API 输入与领域枚举 |
| `backend/src/app.py`、`backend/src/auth.py`、`backend/src/db.py` | 路由、权限、中间件、连接和审计 |
| `backend/src/fieldbook.py`、`clusters.py`、`irrigation.py` | 地块采样、标签发布及滴灌与采收事务 |
| `backend/src/trials.py`、`mixture.py` | 试种地试判、模型参数复用与 GaussianMixture 拟合 |
| `backend/src/worker.py` | Redis 通知、数据库恢复与文件证据 |
| `backend/scripts/seed_demo.py` | 幂等初始化演示数据 |
| `frontend/src/api.js`、`main.js`、`ui.js` | 原生 ES modules 的 API、会话与页面状态、共享组件 |
| `frontend/src/blocks.js`、`clusters.js`、`irrigation.js` | 勘测图、识别批次与试判、排灌、采收表单和账簿 |

共享枚举 `Role`、`Slot`、`Profile`、`RoundState` 定义于 `backend/src/domain.py`、`frontend/src/domain.js`，数据库约束位于 `backend/migrations/001_field_ledger.sql`。识别批次与标签状态在数据库约束和 `backend/src/clusters.py` 中迁移，在 `frontend/src/domain.js` 中映射显示。

## License

供当前工作区使用，许可沿用该工作区约定。


## 业务核验模块

登录后打开页面右下角的「业务核验」。可从实时业务台账筛选记录、导出所选结果，主管可对当前证据签认并填写说明。

- **灌溉与采收对照** 按生效群落汇总已完成灌溉分钟数、观察覆盖率和平均糖度，并标记缺观察的群落。
