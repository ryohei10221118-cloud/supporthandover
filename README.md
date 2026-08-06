# 案件追踪看板 (Support Handover Board)

给其他team被动查询「目前有哪些case待追踪」的唯读看板。资料来源是既有的 Google Sheet 案件记录表，不需要改变 CS 团队现有的填写习惯。

## 功能

- 依部门 / 状态筛选，加上关键字搜寻(序列 / OP / CS / 内容)
- 自动标示逾期案件(状态非 Closed 且日期超过 3 天)
- 总案件数 / 待追踪数 / 逾期数摘要
- 在尚未接上真实 Sheet 前，会显示范例资料，方便先确认功能

## 资料存取方式

后端透过 Google Sheet 的公开 CSV 汇出网址读取资料(`.../export?format=csv&gid=...`)，**不使用** Google API 金钥或服务帐号。所有抓取都在伺服器端(Next.js API route / server component)执行，Sheet ID 不会出现在送到浏览器的前端程式码中 —— 但如果日后 Sheet 的连结外流，任何人都能绕过本工具直接看到完整原始资料，这是此方式的取舍，请评估是否符合你们的资料敏感度需求。

### 必要的前置设定(需要你手动操作)

1. 打开该 Google Sheet → 右上角「共用」→ 将一般存取权限改为「知道连结的使用者」可查看(Viewer)
2. 从网址列取得 `SHEET_ID`(网址中 `/d/` 与 `/edit` 之间那段)与 `SHEET_GID`(网址 `#gid=` 后面那段数字)
3. 设定环境变数(本机开发用 `.env.local`，部署到 Vercel 则在专案的 Environment Variables 设定)：

   ```
   SHEET_ID=你的sheet id
   SHEET_GID=你的sheet gid
   ```

未设定这两个环境变数时，网页会自动显示范例(mock)资料，方便在还没调整分享权限前先确认功能。

## 本机开发

```bash
npm install
npm run dev
```

开启 http://localhost:3000

## 部署

专案是标准 Next.js App Router 应用，可直接部署到 Vercel：

1. 在 Vercel 建立新专案，指向此 repo
2. 在 Vercel 的 Environment Variables 设定 `SHEET_ID` / `SHEET_GID`
3. 部署完成后，把 Vercel 给的网址分享给其他 team —— **不要**分享原始 Google Sheet 连结

## 已知限制 / 后续可以做的事

- 目前没有登入/权限区分，所有能拿到网址的人都能看到全部案件(已确认此为可接受的 MVP 范围)
- 「逾期」目前是单纯以日历天数计算(超过 3 天)，没有把周末排除在外
- 案件目前没有独立的「分类」栏位，无法做案件类型统计；如果之后要做这块分析，建议在 Sheet 新增一个分类下拉栏位，让 CS 建案时顺手选
