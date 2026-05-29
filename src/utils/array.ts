export const chunk = <T>(input: readonly T[], size: number): T[][] => {
  if (size <= 0) throw new RangeError('chunk size must be positive')
  const result: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    result.push(input.slice(i, i + size))
  }
  return result
}
