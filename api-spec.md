# fangz9999.vip 主站 API 文档

> 更新时间：2026-01-26  
> 说明：本文件用于统一前后端接口，所有字段、参数、用途、返回结构如有变动请及时补充。适用于主站首页（Node.js/Express）、前端（fangz.js）、与 Telegram WebApp 小程序对接的主要 API。

---

## 1. [POST] `/api/user`

- **功能简述**：  
  用户进入平台时，上报并持久化其 Telegram 数字ID（会员账号），可记录来源渠道，便于会员体系和流量分析。

- **请求参数（Request Body）**：
  | 字段名 | 类型 | 是否必填 | 说明 |
  |--------------|---------|----------|----------------------|
  | telegramId | string | 是 | Telegram 数字ID |
  | source | string | 否 | 来源渠道参数，可选 |

  **示例入参：**

  ```json
  {
    "telegramId": "568901234",
    "source": "tg_bot_group"
  }
  ```

## 2. [GET] /api/banners

功能简述：
获取主站/欢迎页/轮播区所有活动图配置（图片、标题、链接等），用于动态展示福利活动等内容。
用途：获取平台配置的 Banner（轮播 / 欢迎页主图 / 次图）

| 参数名     | 类型    | 必填 | 示例                        | 说明                     |
| ---------- | ------- | ---- | --------------------------- | ------------------------ |
| place      | string  | 否   | `home` / `welcome`          | 展示位置：首页 / 欢迎页  |
| type       | string  | 否   | `carousel` / `main` / `sub` | banner 类型              |
| limit      | number  | 否   | `3`                         | 返回数量限制             |
| activeOnly | boolean | 否   | `true`                      | 只返回启用且在有效期内的 |
| v          | string  | 否   | `2026-01-27`                | 版本号（缓存穿透用）     |
|            |

说明：

place=home&type=carousel → 首页轮播
place=welcome&type=main/sub → 欢迎页主 / 次福利
不传参数则返回所有 banner（后台调试用）

返回字段说明（banners[]）

| 字段名  | 类型    | 必填 | 说明                    |
| ------- | ------- | ---- | ----------------------- |
| id      | string  | 否   | Banner 唯一ID           |
| place   | string  | 是   | home / welcome          |
| type    | string  | 是   | carousel / main / sub   |
| img     | string  | 是   | 图片地址（相对或绝对）  |
| title   | string  | 否   | 标题（用于 alt / 文案） |
| link    | string  | 否   | 点击跳转地址            |
| target  | string  | 否   | `webapp` / `blank`      |
| badge   | string  | 否   | 角标文案                |
| sort    | number  | 否   | 排序权重（越小越靠前）  |
| enabled | boolean | 否   | 是否启用                |
| startAt | string  | 否   | 生效时间（ISO）         |
| endAt   | string  | 否   | 失效时间（ISO）         |

成功返回示例
{
"ok": true,
"banners": [
{
"id": "bn_001",
"place": "home",
"type": "carousel",
"img": "/images/banners/banner-01.jpg",
"title": "房屋租赁 · 今日推荐",
"link": "https://miniapp.fangz9999.vip",
"badge": "限时",
"target": "webapp",
"sort": 10,
"enabled": true
}
]
}

banner对象结构：

字段名 类型 说明
type string banner 类型（主/次/轮播）
img string 图片URL
title string 标题或说明
link string 点击跳转链接
badge string 小角标文案（可选）

示例出参：

{
"ok": true,
"banners": [
{
"type": "main",
"img": "https://cdn.xx.com/banner1.png",
"title": "新用户立减券",
"link": "/activity/a1",
"badge": "限时"
},
{
"type": "sub",
"img": "https://cdn.xx.com/banner2.png",
"title": "积分翻倍日",
"link": "/activity/a2",
"badge": "今日"
}
]
}

## 3. [GET] /api/home/hot

功能简述：
获取首页「热门推荐」卡片配置，用于首页核心业务推荐区（如：外卖、酒店、活动入口等）。
数据来源于后端配置文件 config/hot.json，支持动态调整，无需修改前端代码。

首页“热门推荐”业务卡片展示,活动入口、重点业务引导,可作为后续推荐系统 / A/B 测试的基础接口

请求方式 GET 请求参数 无

| 字段名 | 类型   | 是否必填 | 说明                       |
| ------ | ------ | -------- | -------------------------- |
| id     | string | 是       | 推荐项唯一标识             |
| title  | string | 是       | 推荐卡片标题               |
| desc   | string | 否       | 推荐说明文案               |
| img    | string | 否       | 图片地址（相对或绝对路径） |
| link   | string | 否       | 点击跳转链接（站内或外链） |

成功返回示例
{
"ok": true,
"list": [
{
"id": "wm-nearby",
"title": "附近外卖 · 支持多商户",
"desc": "下单快、选择多、支持多商户入驻",
"img": "/images/hot/hot-wm.jpg",
"link": "https://qq.fangz9999.vip"
},
{
"id": "hotel-reco",
"title": "酒店推荐 · 今日特价",
"desc": "精选酒店 · 特价房源",
"img": "/images/hot/hot-hotel.jpg",
"link": "https://fangz9999.vip"
}
]
}

失败返回示例
{
"ok": false,
"msg": "暂无热门推荐配置",
"list": []
}

## 4. [GET] /api/home/stores

**功能简述**：  
获取首页「商家推荐」卡片配置，用于首页商家推荐展示区（如：知名/特色/热门商家入口）。

**数据来源**：后端配置文件 `config/stores.json`，支持动态调整。

**请求方式**：GET  
**请求参数**：无

| 字段名  | 类型   | 是否必填 | 说明                              |
| ------- | ------ | -------- | --------------------------------- |
| id      | string | 是       | 商家唯一标识                      |
| name    | string | 是       | 商家名称                          |
| desc    | string | 否       | 商家简介/主营/距离/评分/活动      |
| img     | string | 否       | 商家图片地址                      |
| link    | string | 否       | 点击跳转链接                      |
| btnText | string | 否       | 按钮文案（默认“立即查看 / 进入”） |

**成功返回示例**

```json
{
  "ok": true,
  "list": [
    {
      "id": "jingyushan",
      "name": "京御膳烤鸭",
      "desc": "烤鸭/1.2km/评分4.9/下单返券",
      "img": "/images/store-jingyushan.jpg",
      "link": "https://qq.fangz9999.vip/store/jingyushan",
      "btnText": "立即查看 / 进入"
    }
  ]
}

失败返回示例

{
  "ok": false,
  "msg": "暂无商家推荐配置",
  "list": []
}

3. [POST] /api/log

功能简述：
前端全局错误、用户操作等日志上报，后台统一记录便于排查和安全分析。

请求参数（Request Body）：

字段名 类型 是否必填 说明
msg string 是 错误信息描述
source string 否 出错的源文件
lineno number 否 行号
colno number 否 列号
error string 否 错误堆栈

示例入参：

{
"msg": "页面发生错误: xxx is not defined",
"source": "fangz.js",
"lineno": 128,
"colno": 17,
"error": "ReferenceError: xxx is not defined\n at ..."
}

返回格式（Response JSON）：
{
"ok": false,
"msg": "failed to load banners"
}

字段名 类型 说明
ok boolean 是否成功
msg string 返回信息

示例出参：

{
"ok": true,
"msg": "已记录"
}

接口 1：获取首页分类
【GET】/api/categories
Query 参数
参数 示例 说明
group food 分类分组（外卖/酒店/招聘…）
enabledOnly true 只返回启用的

{
"ok": true,
"group": "food",
"title": "美食外卖",
"categories": [
{
"id": "cooked",
"name": "家常炒菜",
"icon": "/images/categories/cooked.png"
}
]
}

接口 2（后续）：按分类进入列表页

你现在的前端已经天然支持：
/category/:slug

后端只要记住一件事：
slug 永远是 categories.json 里的 id
```
