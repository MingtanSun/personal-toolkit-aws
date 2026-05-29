# 餐厅功能技术方案：OpenStreetMap + Overpass API

## 推荐方案

用 **OpenStreetMap 数据 + Overpass API** 在 Lambda 中查询附近餐厅，替代 Yelp。

| 维度 | OSM + Overpass | Yelp / Google |
|------|----------------|---------------|
| 费用 | **免费**（公共实例 Fair Use） | 试用后付费或按量计费 |
| API Key | **不需要** | 需要 |
| 附近餐厅 POI | **强**（全球含国内） | Yelp 国内弱 |
| 用户评论 / 好评排序 | **弱或没有** | 强 |
| 合规 | ODbL + 署名 © OSM | 平台 ToS |
| 与个人 Dashboard 架构 | **完全匹配**（Lambda 代理 + 缓存） | 同样匹配 |

**结论：** 适合「免费、合法、按城市/坐标列出附近餐厅」；不适合复刻「Yelp 式高评论数好评榜」。产品文案使用 **Nearby restaurants (OpenStreetMap)**，排序为 **米其林/星级优先 + 距离**。

---

## 整体架构

```
浏览器右侧 Restaurants 面板
  ← 复用 weather 的 lat/lon（todoApp_weatherCity）
       ↓
API Gateway  GET /restaurants?lat=&lon=&limit=12&radius=4000
       ↓
Lambda（解析 Overpass JSON → 排序 → 精简字段）
       ↓
Overpass API（默认 overpass-api.de/api/interpreter）
       ↓
OpenStreetMap 数据
```

- 与现有 News / Tasks 模式一致：**仅前端调自己的 API**，不直连 Overpass（避免 CORS、统一缓存与错误处理）。
- **不需要** Yelp / Google API Key。
- 可选环境变量：`OVERPASS_URL`、`OVERPASS_USER_AGENT`。
- 保留 **内存缓存 6 小时**（按 `round(lat,2), round(lon,2), radius, limit`）。

---

## 后端设计

### 接口

```
GET /restaurants?lat=40.7128&lon=-74.0060&limit=12&radius=4000&label=New+York
```

| 参数 | 说明 |
|------|------|
| `lat`, `lon` | 必填，与天气模块一致 |
| `limit` | 默认 12，最大 20 |
| `radius` | 米，默认 4000，范围 500–8000 |
| `label` | 可选，原样返回给前端展示 |

### Overpass 查询（示例）

向 Overpass 发送 **POST**，`Content-Type: application/x-www-form-urlencoded`，body：`data=<Overpass QL>`。

```ql
[out:json][timeout:25];
(
  nwr["amenity"="restaurant"](around:4000,40.7128,-74.0060);
);
out center tags;
```

- `nwr`：node / way / relation。
- `out center`：way/relation 返回中心点，便于算距离。

### Lambda 处理流程

1. 校验 `lat` / `lon`。
2. 查缓存；未命中则请求 Overpass。
3. 解析 `elements[]`：`name`、`cuisine`、`address`、`award:michelin`、`stars`、坐标。
4. 服务端 **haversine** 算距离（米）。
5. **排序：**
   - 优先级 1：`award:michelin` → 3 > 2 > 1 > bib_gourmand > selected
   - 优先级 2：`stars=*` 数值（若存在）
   - 优先级 3：距离升序
6. 取前 `limit` 条返回。

### 返回 JSON

```json
{
  "items": [
    {
      "id": "node/123456",
      "name": "Example Bistro",
      "cuisine": "italian",
      "address": "123 Main St, New York",
      "distanceM": 420,
      "michelin": "1",
      "stars": null,
      "osmUrl": "https://www.openstreetmap.org/node/123456",
      "website": "https://example.com"
    }
  ],
  "source": "openstreetmap",
  "locationLabel": "New York, NY"
}
```

不返回：`rating`、`reviewCount`、`imageUrl`（OSM 无统一字段）。

### 错误处理

| 情况 | 响应 |
|------|------|
| Overpass 超时 / 5xx / 429 | 502 + 友好文案 |
| 无餐厅 | 200 + `items: []` |
| 参数错误 | 400 |

### 公共 Overpass 使用注意

- 个人 dashboard + **长缓存**，日请求控制在数百次以内。
- 设置可识别 **User-Agent**。
- 遇 429：稍后重试；流量大时考虑自建 Overpass 或换备用实例。
- 参考：[Overpass fair use](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)、[OSMF API policy](https://operations.osmfoundation.org/policies/api/)。

### 代码文件

| 文件 | 改动 |
|------|------|
| `lambda_function.py` | Overpass 查询 + OSM 解析与排序 |
| `frontend/app.js` | 卡片：店名、cuisine、距离、米其林；链接 `osmUrl` |
| `index.html` | 标题与 © OpenStreetMap attribution |

---

## 前端设计

- **位置：** 复用 `getSavedWeatherCity()`；`loadWeatherForCity()` 结束后调用 `loadRestaurants()`。
- **无城市：** 提示先在天气面板选城市或定位。
- **面板标题：** Nearby restaurants
- **卡片：** 店名、Michelin（若有）、cuisine、距离；点击 → OpenStreetMap

---

## 合规

- 署名：**© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors**（ODbL）。
- API 查询 + 短缓存；不要将 OSM 数据包装成第三方「好评榜」。

---

## 局限与备选

| 局限 | 说明 |
|------|------|
| 无大众评分/评论数 | UI 不展示 Yelp 式 stars/reviews |
| 米其林稀疏 | 多数区域按距离列出餐厅 |
| 数据质量因地区而异 | 国内大城市通常尚可 |
| Overpass 偶发慢/429 | 依赖缓存与重试 |

若需真实用户好评：可考虑 Google Places（有免费额度）或 Yelp 试用。

---

## 实施步骤

1. Lambda：实现 Overpass，保留 `GET /restaurants`。
2. 前端：更新卡片与 attribution。
3. 更新 `API_GATEWAY_CHECKLIST.txt`、`README`。
4. 在 [overpass-turbo.eu](https://overpass-turbo.eu/) 试跑 QL。
5. 部署 Lambda + S3，用天气城市做端到端测试。
