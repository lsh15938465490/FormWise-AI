export function errMsg(err: unknown, fallback = "操作失败") {
  return err instanceof Error ? err.message : fallback;
}
