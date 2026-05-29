# 前端页面样式参考说明

请参考截图，把当前页面改成一个极简、现代、干净的个人 Dashboard 页面。整体风格接近 Notion / Linear / Apple 系的轻量后台界面。

核心目标不是做得很炫，而是做得干净、克制、像真实产品后台页面。

---

## 1. 整体页面风格

页面整体使用纯白色或接近白色的浅色背景，不要使用明显的彩色渐变。

整体视觉关键词：

- 白色背景
- 浅灰边框
- 轻微阴影
- 小圆角
- 大量留白
- 黑灰文字
- 极简 Dashboard
- 现代 SaaS dashboard 风格
- 接近 Notion / Linear / Apple 的克制设计

不要使用：

- 花哨渐变
- 大面积彩色
- 玻璃拟态
- 过度圆角
- 复杂彩色图标
- 太强的阴影

---

## 2. 页面容器

页面内容整体居中显示，最大宽度控制在大约 1200px–1280px。

左右需要留出比较大的空白，顶部距离页面上边缘大约 24px–32px。

整体布局要显得宽松、安静、有呼吸感。

推荐 CSS：

css body {   background: #ffffff;   color: #111827;   font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }  .dashboard-container {   max-width: 1220px;   margin: 0 auto;   padding: 24px 32px 48px; } 

---

## 3. 字体风格

字体使用系统无衬线字体：

css font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; 

整体文字颜色以黑色、深灰、浅灰为主。

主标题使用接近黑色，副标题和辅助信息使用灰色。

---

## 4. 顶部标题区域

页面左上方显示大标题：

text 个人Dashboard 

标题样式：

css font-size: 28px; font-weight: 800; color: #111827; line-height: 1.2; 

标题下面显示日期：

text 2026年5月28日星期四 

日期样式：

css font-size: 14px; color: #6b7280; margin-top: 8px; 

标题和日期之间间距较小，大约 8px。

标题区域和下面卡片区域之间留出大约 28px–32px 的间距。

---

## 5. 主体 Grid 布局

主体采用卡片式 Grid 布局。

整体分为上下两行。

第一行：

- 左边是天气卡片
- 右边是新闻卡片

第二行：

- 左边是待办事项卡片
- 右边是附近餐厅推荐卡片

布局比例：

第一行：

- 天气卡片宽度约占 1/3
- 新闻卡片宽度约占 2/3

第二行：

- 待办事项卡片宽度约占 2/3
- 餐厅推荐卡片宽度约占 1/3

卡片之间的间距约 20px。

推荐 CSS：

css .dashboard-grid-top {   display: grid;   grid-template-columns: 1fr 2fr;   gap: 20px;   margin-bottom: 20px; }  .dashboard-grid-bottom {   display: grid;   grid-template-columns: 2fr 1fr;   gap: 20px; }  @media (max-width: 768px) {   .dashboard-grid-top,   .dashboard-grid-bottom {     grid-template-columns: 1fr;   } } 

---

## 6. 通用卡片样式

所有卡片统一使用白色背景、浅灰边框、轻微阴影和小圆角。

推荐 CSS：

css .card {   background: #ffffff;   border: 1px solid #e5e7eb;   border-radius: 8px;   box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);   padding: 18px; } 

卡片标题样式：

css .card-title {   font-size: 17px;   font-weight: 700;   color: #111827;   margin-bottom: 20px; } 

辅助文字样式：

css .muted {   color: #6b7280; } 

分割线样式：

css .divider {   border-bottom: 1px solid #eeeeee; } 

卡片不要太圆，圆角保持克制，不要做成很大的圆角。

---

## 7. 天气卡片样式

天气卡片左上角标题：

text 北京 天气 

卡片中部左侧显示一个线性云朵图标。

图标要求：

- 尺寸大约 56px–64px
- 颜色为灰蓝色，例如 #6b7280
- 使用 outline 风格
- 不要填充图标

右侧显示温度：

text 24°C 

温度样式：

css .weather-temp {   font-size: 46px;   font-weight: 800;   color: #1f2937; } 

温度下面右对齐显示天气状态：

text 多云 

天气状态样式：

css .weather-status {   font-size: 14px;   color: #6b7280;   text-align: right; } 

底部显示两个天气指标：

text 湿度: 65% 风速: 12 km/h 

这两个信息横向排列，左一个右一个。每个前面有小图标。

样式要求：

- 字号 13px–14px
- 文字颜色 #374151
- 图标颜色 #6b7280
- 横向分布，左右留出空间

天气卡片高度要比内容略高，留出明显空白，让页面看起来简洁。

---

## 8. 新闻卡片样式

新闻卡片标题：

text 最新新闻 

下面是新闻列表。

每条新闻是一个横向区域，包含左侧内容和右侧 external link 图标。

每条新闻左侧包含：

- 新闻标题
- 新闻来源和时间

新闻标题样式：

css .news-title {   font-size: 15px;   font-weight: 700;   color: #111827; } 

新闻来源和时间样式：

css .news-meta {   font-size: 13px;   color: #6b7280;   margin-top: 6px; } 

右侧 external link 图标：

- 大小约 16px
- 颜色 #6b7280
- 垂直居中

新闻条目样式：

css .news-item {   display: flex;   justify-content: space-between;   align-items: center;   padding: 14px 0;   border-bottom: 1px solid #eeeeee; } 

其中一条新闻需要有 hover 或 selected 效果，背景是非常浅的灰色，类似截图中第三条新闻被浅灰色块高亮。

css .news-item.active, .news-item:hover {   background: #f3f4f6;   border-radius: 6px;   padding-left: 8px;   padding-right: 8px; } 

新闻卡片整体高度大约和天气卡片一致。

---

## 9. 待办事项卡片样式

待办事项卡片标题：

text 待办事项 

标题下面是一行输入框和添加按钮。

输入框占据大部分宽度。

输入框样式：

css .todo-input {   flex: 1;   height: 40px;   background: #f3f4f6;   border: 1px solid #d1d5db;   border-radius: 6px;   padding: 0 12px;   font-size: 14px; } 

placeholder：

text 添加新任务... 

placeholder 颜色：

css .todo-input::placeholder {   color: #9ca3af; } 

右侧添加按钮是深色方形按钮。

按钮样式：

css .add-button {   width: 40px;   height: 40px;   background: #030712;   color: white;   border-radius: 8px;   border: none;   font-size: 22px;   display: flex;   align-items: center;   justify-content: center; } 

输入区域布局：

css .todo-input-row {   display: flex;   gap: 8px;   margin-bottom: 28px; } 

下面是待办列表。

每项左侧是 checkbox，右侧是文字。

每项之间垂直间距约 22px–26px。

css .todo-item {   display: flex;   align-items: center;   gap: 10px;   margin-bottom: 24px;   font-size: 14px;   color: #374151;   font-weight: 500; } 

已完成任务 checkbox 为蓝色勾选状态，文字变灰，并加删除线：

css .todo-item.completed span {   text-decoration: line-through;   color: #6b7280; } 

待办卡片高度较高，内部留有大量空白，整体像一个简洁任务面板。

---

## 10. 附近餐厅推荐卡片样式

餐厅推荐卡片标题：

text 附近餐厅推荐 

下面是餐厅列表。

每个餐厅是一个小卡片，白色背景，浅灰边框，圆角 8px，padding 14px–16px，卡片之间间距约 14px。

餐厅小卡片样式：

css .restaurant-card {   border: 1px solid #e5e7eb;   border-radius: 8px;   background: white;   padding: 14px 16px;   margin-bottom: 14px; } 

餐厅卡片顶部：

- 左侧是餐具图标
- 右侧是餐厅名称
- 右上角是星星和评分

餐厅名称样式：

css .restaurant-name {   font-size: 15px;   font-weight: 700;   color: #111827; } 

评分样式：

css .restaurant-rating {   font-size: 13px;   color: #111827;   font-weight: 500; } 

星星使用黄色：

css .star-icon {   color: #f59e0b; } 

餐厅卡片底部显示：

- 菜系标签，例如 北京菜
- 距离，例如 0.5km
- 人均价格，例如 ¥45

菜系标签使用浅灰背景的小 pill：

css .cuisine-tag {   background: #f3f4f6;   border-radius: 6px;   padding: 3px 6px;   font-size: 12px;   color: #374151;   font-weight: 500; } 

距离前面使用 location 图标，颜色灰色。

价格文字加粗一点：

css .price {   font-weight: 700;   color: #111827; } 

整体餐厅卡片要紧凑，但不能拥挤。

---

## 11. 图标风格

统一使用线性图标，例如 lucide-react。

推荐图标：

js Cloud Wind Droplets ExternalLink Utensils MapPin Star Plus 

图标要求：

- 使用 outline / line 风格
- stroke 宽度保持默认或 1.75–2
- 颜色以灰色为主
- 不要使用复杂彩色图标
- 只有星星可以使用黄色

---

## 12. 推荐整体 CSS 参考

css body {   background: #ffffff;   color: #111827;   font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }  .dashboard-container {   max-width: 1220px;   margin: 0 auto;   padding: 24px 32px 48px; }  .dashboard-title {   font-size: 30px;   font-weight: 800;   color: #111827;   line-height: 1.2;   margin: 0; }  .dashboard-date {   font-size: 14px;   color: #6b7280;   margin-top: 8px; }  .dashboard-content {   margin-top: 32px; }  .dashboard-grid-top {   display: grid;   grid-template-columns: 1fr 2fr;   gap: 20px;   margin-bottom: 20px; }  .dashboard-grid-bottom {   display: grid;   grid-template-columns: 2fr 1fr;   gap: 20px; }  .card {   background: #ffffff;   border: 1px solid #e5e7eb;   border-radius: 8px;   box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);   padding: 18px; }  .card-title {   font-size: 17px;   font-weight: 700;   color: #111827;   margin-bottom: 20px; }  .muted {   color: #6b7280; }  .news-item {   display: flex;   justify-content: space-between;   align-items: center;   padding: 14px 0;   border-bottom: 1px solid #eeeeee; }  .news-item:hover, .news-item.active {   background: #f3f4f6;   border-radius: 6px;   padding-left: 8px;   padding-right: 8px; }  .todo-input-row {   display: flex;   gap: 8px;   margin-bottom: 28px; }  .todo-input {   flex: 1;   height: 40px;   background: #f3f4f6;   border: 1px solid #d1d5db;   border-radius: 6px;   padding: 0 12px;   font-size: 14px; }  .todo-input::placeholder {   color: #9ca3af; }  .add-button {   width: 40px;   height: 40px;   background: #030712;   color: white;   border-radius: 8px;   border: none;   font-size: 22px;   display: flex;   align-items: center;   justify-content: center; }  .todo-item {   display: flex;   align-items: center;   gap: 10px;   margin-bottom: 24px;   font-size: 14px;   color: #374151;   font-weight: 500; }  .todo-item.completed span {   text-decoration: line-through;   color: #6b7280; }  .restaurant-card {   border: 1px solid #e5e7eb;   border-radius: 8px;   background: white;   padding: 14px 16px;   margin-bottom: 14px; }  .restaurant-name {   font-size: 15px;   font-weight: 700;   color: #111827; }  .restaurant-rating {   font-size: 13px;   color: #111827;   font-weight: 500; }  .star-icon {   color: #f59e0b; }  .cuisine-tag {   background: #f3f4f6;   border-radius: 6px;   padding: 3px 6px;   font-size: 12px;   color: #374151;   font-weight: 500; }  .price {   font-weight: 700;   color: #111827; }  @media (max-width: 768px) {   .dashboard-container {     padding: 20px 16px 40px;   }    .dashboard-grid-top,   .dashboard-grid-bottom {     grid-template-columns: 1fr;   } } 

---

## 13. 最终效果要求

最终页面应该看起来像一个真实的轻量个人 Dashboard，而不是练习项目页面。

整体应该做到：

- 布局清晰
- 间距舒服
- 卡片统一
- 颜色克制
- 信息层级明确
- 图标风格统一
- 页面有留白
- 视觉上干净、专业、现代

请优先调整布局、间距、字体、卡片、边框、阴影和颜色，不要添加过多复杂功能。