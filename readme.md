# koishi-plugin-guild-members

[![npm](https://img.shields.io/npm/v/koishi-plugin-guild-members?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-guild-members)

群组成员信息记录服务。

本插件会监听群组事件与消息，把成员资料（昵称、群名片、头像、头衔、入群时间、是否已退群等）记录到数据库中，并通过 `ctx.guildMembers` 服务对外提供查询接口。适用于平台仅在事件中提供群员信息，或需要在群员退群后获取其信息，需要记录该信息以备随时查询的情形。

## 功能

- 自动记录群组成员事件和消息事件中附带的群组成员的名称、昵称、头像等信息。
- 记录成员入群时间和最近发言时间，并在成员退群时将 `quit` 标记为 `true`。
- 更新先写入内存缓冲，再按设定间隔批量上传到数据库，避免频繁写库。

## 配置项

| 字段             | 类型     | 默认值   | 说明                 |
| ---------------- | -------- | -------- | -------------------- |
| `uploadInterval` | `number` | `120000` | 数据上传间隔（毫秒） |

## 数据结构

服务导出 `GuildMember` 接口，数据保存在 `guildMember` 表中：

| 字段         | 类型      | 说明         |
| ------------ | --------- | ------------ |
| `platform`   | `string`  | 平台名称     |
| `guildId`    | `string`  | 群组 ID      |
| `userId`     | `string`  | 用户 ID      |
| `name`       | `string`  | 用户名       |
| `nick`       | `string`  | 群昵称       |
| `avatar`     | `string`  | 头像地址     |
| `title`      | `string`  | 群头衔       |
| `joinedAt`   | `Date`    | 入群时间     |
| `lastActive` | `Date`    | 最近发言时间 |
| `quit`       | `boolean` | 是否已退群   |

## 服务接口

服务位于 `ctx.guildMembers`。

### `get(platform, guildId, userId, fields?)`

查询成员信息，返回 `GuildMember | null`。

```ts
const member = await ctx.guildMembers.get("onebot", "123456789", "987654321")
if (member) {
  console.log(member.nick, member.joinedAt)
}
```

### `list(platform, guildId, fields?)`

获取群组内的所有成员记录，不包含已退群的成员，返回 `GuildMember[]`。

```ts
const members = await ctx.guildMembers.list("onebot", "123456789")
```

### `update(data, clear?)`

更新（或插入）一条成员记录。

```ts
ctx.guildMembers.update({
  platform: "discord",
  guildId: "123456789",
  userId: "987654321",
  nick: "新昵称",
})
```

- 缺少 `platform`、`guildId` 或 `userId` 时会被忽略。
- 更新会先写入内存缓冲，同名记录会合并，定期统一上传。
- `clear` 不为真时，值为 `null` 或 `undefined` 的字段会被忽略。

### `upload()`

立即把缓冲数据上传到数据库。

- 插件会在退出 / 销毁时自动上传。

## 许可证

[MIT](LICENSE)
