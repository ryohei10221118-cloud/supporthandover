# 案件追踪看板 (Support Handover Board)

给其他team被动查询「目前有哪些case待追踪」的唯读看板。资料来源是既有的 Google Sheet 案件记录表，不需要改变 CS 团队现有的填写习惯。

## 功能

- 依部门 / 状态筛选，加上关键字搜寻(序列 / OP / CS / 内容)
- 自动标示逾期案件(状态非 Closed 且日期超过 3 天)
- 总案件数 / 待追踪数 / 逾期数摘要
- 在尚未接上真实 Sheet 前，会显示范例资料，方便先确认功能

## 资料存取方式

支援两种读取方式，依环境变数自动选择：

### 方式 A：服务帐户 + Sheets API(推荐，Sheet 保持不公开)

后端用 Google 服务帐户(Service Account)的凭证，透过 Google Sheets API 读取资料。Sheet 本身**不需要**公开或设成「知道连结可查看」，只要把它分享给服务帐户的信箱当「检视者」即可，跟分享给同事的操作一样。凭证(private key)只存在伺服器端的环境变数，不会出现在送到浏览器的程式码中。

设定步骤：

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立一个专案(免费即可)
2. 「API和服务」→「程式库」→ 搜寻 **Google Sheets API** → 启用
3. 「IAM与管理」→「服务帐户」→ 建立服务帐户(名称随意，例如 `case-board-reader`)，不需要指派任何角色
4. 进入该服务帐户 →「金钥」分页 → 新增金钥 → 建立 JSON 金钥，下载后打开会看到 `client_email` 与 `private_key` 两个栏位
5. 回到该 Google Sheet →「共用」→ 把 `client_email` 那串信箱(格式类似 `xxx@xxx.iam.gserviceaccount.com`)加进去，权限设为「检视者」
6. 从网址列取得 `SHEET_ID`(网址中 `/d/` 与 `/edit` 之间那段)与 `SHEET_GID`(网址 `#gid=` 后面那段数字)
7. 设定环境变数(本机开发用 `.env.local`，部署到 Vercel 则在专案的 Environment Variables 设定)：

   ```
   SHEET_ID=你的sheet id
   SHEET_GID=你的sheet gid
   GOOGLE_SERVICE_ACCOUNT_EMAIL=上面JSON档里的client_email
   GOOGLE_PRIVATE_KEY=上面JSON档里的private_key(整段贴上，含BEGIN/END那两行)
   ```

   JSON 档里的 `private_key` 会长得像 `"-----BEGIN PRIVATE KEY-----\nxxxx...\n-----END PRIVATE KEY-----\n"`，直接整段贴到环境变数即可，程式会自动处理里面的 `\n`。

   下载的 JSON 金钥档本身要收好，不要提交到 git 或分享出去 —— 它等同于这份资料的存取密码。

### 方式 B：公开 CSV 汇出连结(较简单，但 Sheet 需设为可公开检视)

若没有设定 `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`，但有设定 `SHEET_ID`，会改用 Sheet 的公开 CSV 汇出网址读取(`.../export?format=csv&gid=...`)，不需要 Google Cloud 设定，但 Sheet 的共用权限必须改成「知道连结的使用者」可查看 —— 之后如果这个连结外流，任何人都能绕过本工具直接看到完整原始资料。

```
SHEET_ID=你的sheet id
SHEET_GID=你的sheet gid
```

### 都没设定时

网页会自动显示范例(mock)资料，方便在还没接上真实 Sheet 前先确认功能，画面上也会有提示banner。

## 留言 / 改状态的身份验证

其他 team 要留言或修改状态前，需要用公司信箱验证一次身份。做法是寄一组一次性验证码到该信箱(用 Google Apps Script 免费寄信，不需要额外的付费寄信服务)，验证成功后用一个有签章保护的 Cookie 记住登入状态(约 90 天)，之后不用每次重新验证。

设定步骤：

1. 到 [script.google.com](https://script.google.com) 建立一个新专案，把预设程式码换成：

   ```javascript
   function doPost(e) {
     const params = JSON.parse(e.postData.contents);
     if (params.secret !== "换成你自己设的一组密钥") {
       return ContentService.createTextOutput("unauthorized");
     }
     MailApp.sendEmail(params.to, "T1HO Case Board 驗證碼", `您的驗證碼是: ${params.code}\n5 分鐘內有效。`);
     return ContentService.createTextOutput("ok");
   }
   ```

2. 右上角「部署」→「新增部署作业」→ 类型选「网页应用程式」，执行身份设「我」，存取权限设「所有人」→部署，会拿到一个网址(结尾 `/exec`)
3. 设定以下环境变数：

   ```
   ALLOWED_EMAIL_DOMAIN=你们公司信箱的网域(例如 company.com)
   AUTH_SECRET=一组够长的随机字串，例如用 `openssl rand -hex 32` 产生
   APPS_SCRIPT_MAIL_URL=上面拿到的 Apps Script 网址
   APPS_SCRIPT_SECRET=跟 Apps Script 程式码里同一组密钥
   ```

`密钥(secret)` 只是我们伺服器跟 Apps Script 之间互相核对用的固定暗号，不会出现在寄给使用者的信件内容里；真正寄给使用者的一次性验证码是伺服器每次当场随机产生的。

## 本机开发

```bash
npm install
npm run dev
```

开启 http://localhost:3000

## 部署

专案是标准 Next.js App Router 应用，可直接部署到 Vercel：

1. 在 Vercel 建立新专案，指向此 repo
2. 在 Vercel 的 Environment Variables 设定上面「资料存取方式」提到的环境变数(建议用方式 A)
3. 部署完成后，把 Vercel 给的网址分享给其他 team —— **不要**分享原始 Google Sheet 连结

## 已知限制 / 后续可以做的事

- 浏览看板本身不需要登入，所有能拿到网址的人都能看到全部案件(已确认此为可接受的 MVP 范围)；留言/改状态才需要公司信箱验证
- 留言/改状态的后端(`lib/sheetsApi.ts` 的 `appendReply` / `updateStatus`)跟身份验证(`/api/auth/*`)都已完成，但还没有对应的网页介面按钮，也还没有实际串接会呼叫这两个写入函式的 API
- 「逾期」目前是单纯以日历天数计算(超过 3 天)，没有把周末排除在外
- 案件目前没有独立的「分类」栏位，无法做案件类型统计；如果之后要做这块分析，建议在 Sheet 新增一个分类下拉栏位，让 CS 建案时顺手选
