// 表单保留原始输入以展示错误；只有合法数值进入档案草稿。
export const numberOrNull = (
  value: string,
  minimum: number,
  maximum: number,
  integer = false,
) => {
  if (!value.trim()) {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) &&
    number >= minimum &&
    number <= maximum &&
    (!integer || Number.isInteger(number))
    ? number
    : null
}
