import chalk, { Chalk } from 'chalk'

declare const console: any

type Methods = { [M in string]: (...args: any) => void }

/**
 * 
 * 覆盖原生 node 的 console 方法
 * @param {{
 *   output: (p: { method: string; args: any[]; oldMethods: Methods }) => void
 *   methods: string[]
 *   invokeOld?: boolean
 * }} {
 *   output, 重学的工厂函数，包含当前要修改的 method 名，传入参数，被覆盖的所有 console 原方法
 *   methods, 需要重写的方法名
 * } 
 */
const overloadConsole = ({
  output,
  methods,
}: {
  output: (p: { method: string; args: any[]; oldMethods: Methods }) => void
  methods: string[]
  invokeOld?: boolean
}) => {
  const oldMethods: Methods = {}

  methods.forEach((m) => {
    const method = m as keyof Console
    if (typeof console[method] !== 'function') return
    oldMethods[method] = console[method]
    console[method] = (...args: any[]) => {
      output({ method, args, oldMethods })
    }
  })
}

/**
 * 禁止控制台打印，这里直接用空函数代替原来的 console 的 method
 */
export const disabledConsoleOutput = () => {
  overloadConsole({
    methods: ['log', 'warn', 'info'],
    output: () => {},
  })
}

/**
 * 让控制台变颜色
 */
export const makeConsoleColored = () => {
  // 重写 console 方法
  overloadConsole({
    methods: ['log', 'warn', 'error', 'info'],
    output: ({ method, args, oldMethods }) => {
      const fns: Record<string, Chalk> = {
        warn: chalk.yellowBright,
        info: chalk.blueBright,
        error: chalk.redBright,
      }
      const fn = fns[method] || ((arg: any) => arg)

      oldMethods[method](
        ...args.map((arg) => (typeof arg === 'string' ? fn(arg) : arg))
      )
    },
  })
}
