export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  code = "INVALID_STATE",
): asserts condition {
  if (!condition) throw new AppError(409, code, message);
}
