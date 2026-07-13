/** Structural stand-ins for optional peers (pg, redis) so their types never leak into dist typings. */

export interface PgQueryResultLike<R = Record<string, unknown>> {
  rows: R[]
  rowCount?: number | null
}

export interface PgPoolClientLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<PgQueryResultLike<R>>
  release(): void
}

export interface PgPoolLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<PgQueryResultLike<R>>
  connect(): Promise<PgPoolClientLike>
  end(): Promise<void>
}

export interface PgPoolCtorLike {
  new (config: { connectionString?: string | undefined; max?: number | undefined }): PgPoolLike
}

export interface RedisMultiLike {
  set(key: string, value: string): RedisMultiLike
  del(key: string): RedisMultiLike
  sAdd(key: string, members: string): RedisMultiLike
  sRem(key: string, members: string): RedisMultiLike
  hSet(key: string, field: string, value: string): RedisMultiLike
  hDel(key: string, fields: string | string[]): RedisMultiLike
  zAdd(key: string, entry: { score: number; value: string }): RedisMultiLike
  zRem(key: string, members: string | string[]): RedisMultiLike
  exec(): Promise<unknown>
}

export interface RedisClientLike {
  readonly isOpen: boolean
  connect(): Promise<unknown>
  quit(): Promise<unknown>
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>
  del(keys: string | string[]): Promise<number>
  mGet(keys: string[]): Promise<Array<string | null>>
  hGet(key: string, field: string): Promise<string | null | undefined>
  hSet(key: string, field: string, value: string): Promise<number>
  hDel(key: string, fields: string | string[]): Promise<number>
  hmGet(key: string, fields: string[]): Promise<Array<string | null>>
  hGetAll(key: string): Promise<Record<string, string>>
  sAdd(key: string, members: string): Promise<number>
  sRem(key: string, members: string): Promise<number>
  sMembers(key: string): Promise<string[]>
  sIsMember(key: string, member: string): Promise<boolean | number>
  zRange(key: string, min: number, max: number): Promise<string[]>
  zRangeByScore(
    key: string,
    min: string | number,
    max: string | number,
    options?: { LIMIT?: { offset: number; count: number } },
  ): Promise<string[]>
  scan(
    cursor: number,
    options?: { MATCH?: string; COUNT?: number },
  ): Promise<{ cursor: number | string; keys: string[] }>
  multi(): RedisMultiLike
}
