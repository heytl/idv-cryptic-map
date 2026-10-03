export function requestErrorMessage(detail: string): string {
  if (/domain|域名|url not in/i.test(detail)) {
    return "地图服务域名未获微信允许，请配置 request 合法域名或在开发者工具中关闭域名校验";
  }
  if (/timeout|timed out/i.test(detail)) return "读取地图超时，请检查网络后重试";
  return "无法连接地图服务，请检查网络后重试";
}
