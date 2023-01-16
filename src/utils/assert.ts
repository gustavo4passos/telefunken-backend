export function assertIsDefined<T>(d: T | null | undefined): asserts d is T {
  if (d == null || d == undefined) {
    const varExtractor = new RegExp('return (.*);')
    throw new Error(
      `Fatal error: parameter ${varExtractor.exec(
        d + ''
      )} cannot be undefined or null`
    )
  }
}
