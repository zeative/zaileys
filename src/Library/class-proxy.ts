type AnyObj = Record<PropertyKey, any>

export function classInjection<B extends AnyObj, M extends AnyObj[]>(
  base: B,
  mixins: [...M]
): B & M[number] {
  const len = mixins.length

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop in target) {
        const v = Reflect.get(target, prop, receiver)
        if (typeof v === 'function') return (v as (...args: any[]) => any).bind(receiver)
        return v
      }

      for (let i = 0; i < len; i++) {
        const src = mixins[i]
        if (prop in src) {
          const v = Reflect.get(src, prop, src)
          if (typeof v === 'function') return (v as (...args: any[]) => any).bind(src)
          return v
        }
      }
      return undefined
    },

    set(target, prop, value, receiver) {
      if (prop in target) return Reflect.set(target, prop, value, receiver)

      for (let i = 0; i < len; i++) {
        const src = mixins[i]
        if (prop in src) return Reflect.set(src, prop, value, src)
      }

      return Reflect.set(target, prop, value, receiver)
    },

    has(_, prop) {
      if (prop in base) return true
      for (let i = 0; i < len; i++) {
        if (prop in mixins[i]) return true
      }
      return false
    },

    ownKeys() {
      const seen = new Set<string | symbol>(Reflect.ownKeys(base))
      const keys = [...seen]

      for (let i = 0; i < len; i++) {
        for (const k of Reflect.ownKeys(mixins[i])) {
          if (!seen.has(k)) {
            seen.add(k)
            keys.push(k)
          }
        }
      }
      return keys
    },

    getOwnPropertyDescriptor(_, prop) {
      let desc = Object.getOwnPropertyDescriptor(base, prop)
      if (desc) return desc

      for (let i = 0; i < len; i++) {
        desc = Object.getOwnPropertyDescriptor(mixins[i], prop)
        if (desc) return { ...desc, configurable: true }
      }
      return undefined
    },
  }) as B & M[number]
}