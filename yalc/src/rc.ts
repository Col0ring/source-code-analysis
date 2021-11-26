import fs from 'fs'
// 解析 .yalcrc 文件为 json 对象格式
const ini = require('ini')

// .yalcrc 文件只包含有如下配置项
const validFlags = [
  'sig',
  'workspace-resolve',
  'dev-mod',
  'scripts',
  'quiet',
  'files',
]

const fileName = '.yalcrc'

/**
 * 解析 .yalcrc 文件为 json 对象
 * @returns
 */
const readFile = (): Record<string, string | boolean> | null => {
  if (fs.existsSync(fileName)) {
    return ini.parse(fs.readFileSync(fileName, 'utf-8'))
  }
  return null
}

/**
 * 读取配置文件参数
 * @returns
 */
export const readRcConfig = (): Record<string, string | boolean> => {
  const rcOptions = readFile()
  // 如果没有 .yalcrc 文件
  if (!rcOptions) return {}

  // 非法配置项
  const unknown = Object.keys(rcOptions).filter(
    (key) => !validFlags.includes(key)
  )

  // 不能传非法配置项
  if (unknown.length) {
    console.warn(`Unknown option in ${fileName}: ${unknown[0]}`)
    process.exit()
  }
  // 这里其实可以直接返回 rcOptions，下面就是过滤非法选项
  return Object.keys(rcOptions).reduce((prev, flag) => {
    // 这里的检验有点多余了，上面已经非法校验过一次了
    return validFlags.includes(flag)
      ? { ...prev, [flag]: rcOptions[flag] }
      : prev
  }, {})
}
