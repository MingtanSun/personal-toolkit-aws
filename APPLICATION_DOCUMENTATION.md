# Personal Toolkit 应用文档

## 1. 应用概述

Personal Toolkit 是一个基于 Serverless 架构的个人仪表盘应用，用于在同一个页面集中查看日常信息和处理轻量任务。应用当前提供 Cognito 登录、待办事项、天气预报、国际新闻和本地电影信息等核心能力，适合部署为个人主页或私人效率面板。

项目采用静态前端 + AWS 后端的方式实现：前端页面托管在 S3 等静态站点服务上，用户通过 Amazon Cognito Hosted UI 登录，前端携带 JWT 调用 API Gateway，后端通过 Lambda 处理业务，任务数据按 Cognito 用户 ID 隔离存储在 DynamoDB 中。新闻与电影数据由 Lambda 聚合外部服务后返回，天气数据由浏览器端直接调用 Open-Meteo 等公开接口获取。

## 2. 当前功能

### 2.1 身份认证

身份系统使用 Amazon Cognito User Pool 和 OAuth 2.0 Authorization Code + PKCE 流程实现。

主要能力：

- 登录与登出：前端跳转到 Cognito Hosted UI 完成登录，登出时清理本地会话并跳转 Cognito logout。
- 会话恢复：页面刷新后从 `sessionStorage` 恢复 token。
- token 刷新：access token 过期前使用 refresh token 换取新 token。
- API 鉴权：调用 `/tasks`、`/news`、`/movies` 时自动附带 `Authorization: Bearer <token>`。
- 后端信任边界：Lambda 只从 API Gateway authorizer 注入的 JWT claims 中读取 Cognito `sub`，不信任前端请求体传入的用户信息。
- 未登录状态：仪表盘主体隐藏，用户需要登录后才能加载受保护数据。

### 2.2 待办事项

待办模块用于记录和管理个人任务，数据按用户隔离持久化在 DynamoDB 表中。

主要能力：

- 新增任务：在输入框输入任务标题，点击添加按钮或按 Enter 创建任务。
- 查看任务：打开页面后自动加载任务列表。
- 完成任务：通过复选框标记任务完成或未完成。
- 星标任务：将重要任务标记为星标，星标任务在列表中优先显示。
- 编辑任务：双击未完成任务标题进入编辑状态，按 Enter 或失焦保存，按 Escape 取消。
- 删除任务：点击删除按钮后经过确认再删除。
- 任务筛选：支持 `All`、`Active`、`Starred` 三种视图。
- 本地偏好保存：当前任务筛选状态保存在浏览器 `localStorage` 中。

### 2.3 天气

天气模块用于查看指定城市或当前位置的当前天气和 5 天天气预报。

主要能力：

- 默认城市：首次打开时显示 Toronto, Ontario, Canada。
- 城市搜索：通过 Open-Meteo Geocoding API 搜索城市，并从结果中选择位置。
- 当前位置：可通过浏览器地理位置权限获取当前位置，并使用 OpenStreetMap Nominatim 反查位置名称。
- 实时天气：展示温度、天气状态、湿度、风速和更新时间。
- 5 天预报：展示今日、明日及后续日期的天气图标和最高/最低温。
- 天气动效：雨、雪、雷暴等天气状态会触发卡片内 Canvas 动画。
- 本地保存：选中的天气城市保存在浏览器 `localStorage` 中。

### 2.4 国际新闻

新闻模块用于聚合主要国际媒体的世界新闻标题。

主要能力：

- 自动加载国际新闻标题。
- 支持刷新新闻列表。
- 展示新闻来源和发布时间。
- 点击新闻条目跳转到原始媒体页面。
- 根据新闻来源生成筛选按钮，可按来源过滤新闻。
- 当后端 `/news` 接口不可用或返回空列表时，前端会尝试通过 RSS 代理进行客户端兜底加载。

当前聚合来源包括：

- The New York Times
- The Guardian
- BBC News
- The Washington Post
- Financial Times
- Xinhua
- The Times
- The Telegraph

### 2.5 本地电影

电影模块用于查看用户所在地区正在上映和即将上映的电影，数据来源为 TMDB。

主要能力：

- 根据天气城市的国家代码推断电影地区，默认地区为 Canada (`CA`)。
- 支持 `Now playing` 和 `Coming soon` 两个分类。
- 支持分页浏览电影列表。
- 展示电影海报、标题、上映日期、评分和简介。
- 点击电影卡片跳转到 TMDB 详情页。
- 前端按地区、分类和页码缓存已加载数据。
- Lambda 端对 TMDB 结果做 6 小时内存缓存，减少外部 API 请求。

### 2.6 主题与界面体验

应用提供轻量的个性化界面体验：

- 支持浅色和深色主题切换。
- 主题偏好保存在浏览器 `localStorage` 中。
- 页面顶部显示当前日期。
- 卡片支持鼠标悬停高光效果。
- 遵循 `prefers-reduced-motion`，在用户要求减少动画时关闭部分动效。
- 布局采用桌面仪表盘风格：新闻和电影位于主内容区，天气和待办位于侧边栏。

## 3. 技术架构

### 3.1 总体结构

```text
Browser
  ├─ Static frontend: index.html / styles.css / config.js / app.js / weather-fx.js
  ├─ Cognito Hosted UI: OAuth Code + PKCE login
  ├─ Direct external APIs: Open-Meteo, OpenStreetMap Nominatim, RSS fallback proxies
  └─ API Gateway
       ├─ Cognito JWT Authorizer
       └─ AWS Lambda
            ├─ DynamoDB: user-partitioned tasks
            ├─ RSS news feeds
            └─ TMDB API
```

### 3.2 前端

前端位于 `frontend/` 目录，是一个无构建步骤的原生 Web 单页应用。

主要文件：

- `frontend/index.html`：页面结构和主要卡片区域。
- `frontend/config.js`：部署环境配置，包含 API Gateway 和 Cognito 参数。
- `frontend/config.example.js`：前端配置模板。
- `frontend/styles.css`：布局、主题、响应式样式和卡片视觉效果。
- `frontend/app.js`：任务、天气、新闻、电影、主题等主要交互逻辑。
- `frontend/weather-fx.js`：天气卡片 Canvas 动画。
- `frontend/icon.png`：站点图标。

前端通过 `frontend/config.js` 连接 API Gateway 和 Cognito：

```js
window.APP_CONFIG = {
  API_URL: "https://your-api-id.execute-api.us-east-2.amazonaws.com/prod",
  COGNITO_DOMAIN: "https://your-domain.auth.us-east-2.amazoncognito.com",
  COGNITO_CLIENT_ID: "your-cognito-app-client-id"
};
```

如果 API Gateway 或 Cognito 资源变化，只需要更新 `frontend/config.js`。

### 3.3 后端

后端位于 `backend/lambda_function.py`，由单个 Lambda 处理多个 HTTP 路由。

后端职责：

- 提供任务 CRUD 能力。
- 从 API Gateway authorizer claims 读取 Cognito `sub` 作为用户 ID。
- 从多个 RSS 源抓取并合并新闻标题。
- 代理 TMDB 电影接口，并规范化返回字段。
- 返回 CORS 响应头，方便浏览器调用。

### 3.4 数据存储

任务数据存储在 DynamoDB 表中，采用按用户分区的 `PK/SK` 模型。

主键设计：

- `PK = USER#{cognitoSub}`
- `SK = TASK#{taskId}`

当前任务字段：

- `taskId`：任务唯一 ID，由 Lambda 使用 UUID 生成。
- `userId`：Cognito 用户 `sub`。
- `title`：任务标题。
- `completed`：是否完成。
- `starred`：是否星标。
- `createdAt`：创建时间。
- `updatedAt`：更新时间。

天气城市、主题和筛选偏好存储在浏览器 `localStorage` 中，不进入后端数据库。

## 4. API 说明

所有后端 API 均要求 Cognito JWT：

```text
Authorization: Bearer <access_token>
```

缺少或无效 token 时返回 `401 unauthorized`。

### 4.1 任务接口

#### GET `/tasks`

获取所有任务。

返回示例：

```json
[
  {
    "taskId": "uuid",
    "title": "Example task",
    "completed": false,
    "starred": true,
    "createdAt": "2026-06-05T12:00:00+00:00",
    "updatedAt": "2026-06-05T12:00:00+00:00"
  }
]
```

#### POST `/tasks`

创建任务或执行任务更新操作。

创建任务：

```json
{
  "title": "Read news"
}
```

标记完成：

```json
{
  "op": "setCompleted",
  "taskId": "uuid",
  "completed": true
}
```

设置星标：

```json
{
  "op": "setStarred",
  "taskId": "uuid",
  "starred": true
}
```

重命名任务：

```json
{
  "op": "rename",
  "taskId": "uuid",
  "title": "New title"
}
```

#### DELETE `/tasks/{id}`

删除指定任务。

#### PATCH `/tasks/{id}`

当前前端不使用该接口。后端保留了只更新 `completed` 字段的兼容接口。

### 4.2 新闻接口

#### GET `/news`

返回聚合后的新闻列表。

返回示例：

```json
{
  "items": [
    {
      "title": "News title",
      "url": "https://example.com/news",
      "source": "BBC News",
      "published": "2026-06-05T12:00:00+00:00"
    }
  ]
}
```

接口设计为尽量返回 HTTP 200。当 RSS 抓取失败时，返回空 `items`，前端再尝试客户端兜底。

### 4.3 电影接口

#### GET `/movies`

查询 TMDB 电影列表。

查询参数：

- `region`：两位国家或地区代码，例如 `CA`、`US`。
- `category`：电影分类，支持 `now` 和 `upcoming`。
- `page`：页码，最小为 `1`，最大限制为 `500`。

请求示例：

```text
GET /movies?region=CA&category=now&page=1
```

返回示例：

```json
{
  "region": "CA",
  "source": "tmdb",
  "category": "now",
  "page": 1,
  "totalPages": 10,
  "totalResults": 200,
  "items": [
    {
      "id": "123",
      "title": "Movie title",
      "overview": "Movie overview",
      "releaseDate": "2026-06-05",
      "rating": 7.8,
      "posterUrl": "https://image.tmdb.org/t/p/w342/xxx.jpg",
      "backdropUrl": "https://image.tmdb.org/t/p/w342/yyy.jpg",
      "tmdbUrl": "https://www.themoviedb.org/movie/123"
    }
  ]
}
```

## 5. 外部服务依赖

当前应用使用以下外部服务：

- AWS S3：推荐用于托管前端静态文件。
- AWS API Gateway：提供浏览器可访问的 HTTP API。
- Amazon Cognito：提供用户池、Hosted UI 和 JWT。
- AWS Lambda：运行 Python 后端逻辑。
- AWS DynamoDB：存储任务数据。
- TMDB：提供电影数据，需要配置 API Key。
- Open-Meteo Forecast API：提供天气预报。
- Open-Meteo Geocoding API：提供城市搜索。
- OpenStreetMap Nominatim：用于当前位置反向地理编码。
- 多个媒体 RSS 源：用于聚合国际新闻。
- RSS 代理服务：仅作为浏览器端新闻兜底路径使用。

## 6. 配置项

### 6.1 前端配置

在 `frontend/config.js` 中配置环境：

```js
window.APP_CONFIG = {
  API_URL: "https://your-api-id.execute-api.us-east-2.amazonaws.com/prod",
  AWS_REGION: "us-east-2",
  COGNITO_DOMAIN: "https://your-domain.auth.us-east-2.amazoncognito.com",
  COGNITO_CLIENT_ID: "your-cognito-app-client-id",
  COGNITO_REDIRECT_URI: window.location.origin + window.location.pathname,
  COGNITO_LOGOUT_URI: window.location.origin + window.location.pathname,
  COGNITO_SCOPES: ["openid", "email", "profile"]
};
```

浏览器本地存储键：

- `todoApp_taskFilter`：任务筛选状态。
- `todoApp_theme`：主题偏好。
- `todoApp_weatherCity`：已选择的天气城市。

浏览器会话存储键：

- `todoApp_authTokens`：当前 Cognito token，会话级存储在 `sessionStorage`。
- `todoApp_pkce`：OAuth PKCE verifier，登录回调后清除。
- `todoApp_oauthState`：OAuth state，登录回调后清除。

### 6.2 Lambda 环境变量

电影功能需要配置：

- `TASKS_TABLE_NAME`：任务 DynamoDB 表名，默认 `TodoTable`。
- `TMDB_API_KEY`：必填，TMDB API Key。
- `TMDB_BASE_URL`：可选，默认 `https://api.themoviedb.org/3`。
- `TMDB_IMAGE_BASE_URL`：可选，默认 `https://image.tmdb.org/t/p/w342`。

历史 README 中提到的 `OVERPASS_URL`、`OVERPASS_USER_AGENT` 与附近餐厅功能相关，但当前活动代码中没有启用餐厅模块。

## 7. 部署说明

### 7.1 前端部署

将以下文件上传到同一个静态站点目录：

- `frontend/index.html`
- `frontend/styles.css`
- `frontend/config.js`
- `frontend/app.js`
- `frontend/weather-fx.js`
- `frontend/icon.png`

如果使用 S3 静态网站托管，需要确保这些文件保持相对路径不变。

### 7.2 后端部署

推荐使用 `infra/template.yaml` 通过 AWS SAM 部署 Cognito、HTTP API、Lambda 和 DynamoDB。

示例：

```text
sam build --template-file infra/template.yaml
sam deploy --guided
```

部署后，将输出的 `ApiUrl`、`CognitoDomain`、`CognitoClientId`、`AwsRegion` 写入 `frontend/config.js`。

如果手动部署 `backend/lambda_function.py` 到 AWS Lambda，需要确保 Lambda 具备访问 DynamoDB 表的权限，并配置 API Gateway Cognito/JWT Authorizer。

API Gateway 需要配置以下路由：

- `GET /tasks`
- `POST /tasks`
- `DELETE /tasks/{id}`
- `GET /news`
- `GET /movies`
- `OPTIONS` 预检请求

可选路由：

- `PATCH /tasks/{id}`

所有 JSON 响应应包含：

```text
Content-Type: application/json
Access-Control-Allow-Origin: *
```

OPTIONS 响应应允许：

```text
Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: content-type,authorization
```

## 8. 错误处理与降级策略

应用包含以下降级设计：

- 任务接口失败时，前端显示明确的错误提示，并保留页面可用状态。
- 会话过期或 401/403 时，前端清理会话并回到登录状态。
- 新闻接口失败或返回空结果时，前端尝试通过 RSS 代理直接抓取新闻。
- 电影接口缺少 `TMDB_API_KEY` 时，后端返回 `503`，前端显示错误信息。
- 天气城市搜索或预报失败时，天气卡片显示错误状态。
- 浏览器不支持或拒绝地理位置权限时，用户仍可手动搜索城市。
- 动效遵循系统减少动画设置，避免影响可访问性。

## 9. 当前限制

- 当前前端使用 Cognito Hosted UI，没有自定义注册/登录表单。
- 当前 token 存储在 `sessionStorage`，页面关闭后需要重新恢复登录流程。
- 新闻依赖 RSS 源和代理服务，稳定性受外部网站影响。
- 电影数据依赖 TMDB API Key 和外部网络可用性。
- 天气数据在前端直接请求第三方服务，无法由后端统一审计或缓存。
- 当前活动 UI 中没有附近餐厅模块；相关内容仅存在于归档计划文件中。

## 10. 适合的后续改进

- 为任务增加创建时间、排序字段、到期时间或标签。
- 为新闻和电影增加更稳定的后端缓存。
- 增加 GitHub Actions 自动运行测试和 SAM validate。
- 增加更完整的可观测性，例如结构化日志、请求 ID 和 CloudWatch 告警。
- 若需要恢复附近餐厅功能，可基于归档设计重新接入 OpenStreetMap + Overpass。
