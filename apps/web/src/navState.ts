// 是否由目录页内点击进入攻略页：是则返回按钮走 router.back()，
// 否则（分享链接直达）返回按钮改为前进到目录，避免退出站点
export const navState = {
  enteredFromCatalog: false,
};
