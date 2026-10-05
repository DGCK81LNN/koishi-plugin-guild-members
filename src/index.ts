import { Context, Logger, omit, Schema, Service, Session, Time } from "koishi"

export interface GuildMember {
  platform: string
  guildId: string
  userId: string
  name?: string
  nick?: string
  avatar?: string
  title?: string
  joinedAt?: Date
  lastActive?: Date
  quit?: boolean
}

declare module "koishi" {
  interface Tables {
    guildMember: GuildMember
  }

  interface Context {
    guildMembers: GuildMembersService
  }
}

class GuildMembersService extends Service {
  static name = "guild-members"
  static inject = ["database"]

  static Config: Schema<GuildMembersService.Config> = Schema.object({
    uploadInterval: Schema.natural()
      .role("ms")
      .default(2 * Time.minute)
      .description("数据上传间隔。"),
  })

  private context: Context
  private logger: Logger

  constructor(
    ctx: Context,
    public config: GuildMembersService.Config,
  ) {
    super(ctx, "guildMembers", true)
    this.context = ctx
    this.logger = ctx.logger("guild-members")

    ctx.model.extend(
      "guildMember",
      {
        platform: "string",
        guildId: "string",
        userId: "string",
        name: "string",
        nick: "string",
        avatar: "string",
        title: "string",
        joinedAt: "timestamp",
        lastActive: "timestamp",
        quit: { type: "boolean", initial: false },
      },
      {
        primary: ["platform", "guildId", "userId"],
      },
    )

    ctx.on("guild-member-added", session => this._updateFromSession(session, true))
    ctx.on("guild-member-updated", session => this._updateFromSession(session))
    ctx.on("guild-member-removed", session => {
      this.update({
        platform: session.platform,
        guildId: session.guildId!,
        userId: session.userId!,
        quit: true,
      })
    })
    ctx.guild().on("message", session => this._updateFromSession(session))

    ctx.setInterval(() => this.upload(), this.config.uploadInterval)

    ctx.on("exit", () => this.upload())
    ctx.on("dispose", async () => await this.upload())
  }

  buffer: GuildMember[] = []

  update(data: Partial<GuildMember>, clear?: boolean) {
    if (!data.platform || !data.guildId || !data.userId) {
      this.logger.debug("ignoring update with missing primary keys %o", data)
      return
    }
    // remove nullish values to avoid overwriting existing data
    let member = (
      clear ? data : (
        omit(
          data,
          (Object.keys(data) as (keyof GuildMember)[]).filter(key => data[key] == null),
        )
      )) as GuildMember

    const pending = this.buffer.find(
      item =>
        item.platform === member.platform &&
        item.guildId === member.guildId &&
        item.userId === member.userId,
    )
    if (pending) {
      Object.assign(pending, member)
    } else {
      this.buffer.push(member)
    }
    this.logger.debug("update", pending ?? member)
  }

  _updateFromSession(session: Session, isJoin = false) {
    const time = new Date(session.event.timestamp || Date.now())
    this.update(
      {
        platform: session.platform,
        guildId: session.guildId,
        userId: session.userId,
        name: session.event.member?.name || session.event.user?.name,
        nick: session.event.member?.nick || session.event.user?.nick,
        avatar: session.event.member?.avatar || session.event.user?.avatar,
        title: session.event.member?.title,
        joinedAt: isJoin ? time : undefined,
        lastActive: isJoin ? undefined : time,
        quit: false,
      },
      isJoin,
    )
  }

  async upload() {
    if (this.buffer.length === 0) return
    const buffer = this.buffer.slice()
    this.buffer.length = 0
    this.logger.debug("upload", buffer)
    await this.context.database
      .upsert("guildMember", buffer)
      .catch(err => this.logger.error("%o", err))
  }

  async get(
    platform: string,
    guildId: string,
    userId: string,
    fields?: (keyof GuildMember)[],
  ): Promise<GuildMember | null> {
    const pending = this.buffer.find(
      item =>
        item.platform === platform && item.guildId === guildId && item.userId === userId,
    )
    if (pending && (!fields || fields.every(field => field in pending))) return pending
    const [data] = await this.context.database.get(
      "guildMember",
      {
        platform,
        guildId,
        userId,
      },
      fields,
    )
    if (!data && !pending) return null
    return Object.assign({}, data, pending)
  }

  async list(
    platform: string,
    guildId: string,
    fields?: (keyof GuildMember)[],
  ): Promise<GuildMember[]> {
    const pending = this.buffer.filter(
      item => item.platform === platform && item.guildId === guildId,
    )
    const data = (await this.context.database.get(
      "guildMember",
      { platform, guildId, quit: false },
      fields,
    )) as GuildMember[]
    const map = new Map(data.map(item => [item.userId, item]))
    for (const item of pending) {
      if (map.has(item.userId)) {
        Object.assign(map.get(item.userId)!, item)
      } else {
        map.set(item.userId, item)
      }
    }
    return Array.from(map.values())
  }
}

namespace GuildMembersService {
  export interface Config {
    uploadInterval: number
  }
}

export default GuildMembersService
