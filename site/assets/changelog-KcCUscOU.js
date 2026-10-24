import{d as w,c as o,a as b,o as s,F as _,r as v,t as k,j as C,w as x,e as H,k as $,_ as Z}from"./index-C5PK9ggV.js";function D(l){const h=[];let i,t=!0;const f=l.replace(/\r\n?/g,`
`).replace(/<!--[\s\S]*?-->/g,e=>e.replace(/[^\n]/g,"")).split(`
`);for(const[e,d]of f.entries()){const n=d.trim(),p=a=>{throw new Error(`CHANGELOG.md 第 ${e+1} 行：${a}`)};if(!n){t=!0;continue}if(/^#\s/.test(n)&&!i)continue;if(/^##\s/.test(n)){const a=n.slice(3).split("|").map(y=>y.trim()),[c,g,M]=a;(a.length!==3||!c||!g||!M||!/^\d{4}-\d{2}-\d{2}$/.test(c)||!Number.isFinite(Date.parse(c))||new Date(c).toISOString().slice(0,10)!==c)&&p("记录标题应为「## YYYY-MM-DD | 版本号 | 发布状态」，日期必须有效。"),i={id:`${c}-${g}`,date:c,version:g,status:M,title:"",blocks:[]},h.push(i),t=!0;continue}i||p("内容需放在一条更新记录中。");const r=i;if(/^###\s/.test(n)){(r.title||r.blocks.length)&&p("每条记录仅使用一个 ### 更新标题。"),r.title=n.slice(4).trim(),t=!0;continue}r.title||p("请先填写 ### 更新标题。");const u=r.blocks[r.blocks.length-1];if(/^####\s/.test(n))r.blocks.push({type:"heading",text:n.slice(5).trim()});else if(/^[-*]\s/.test(n)){const a=n.slice(2).trim();u?.type==="list"&&!t?u.items.push(a):r.blocks.push({type:"list",items:[a]})}else/^#/.test(n)&&p("正文小标题使用 ####。"),u?.type==="paragraph"&&!t?u.text+=` ${n}`:r.blocks.push({type:"paragraph",text:n});t=!1}const m=new Set;for(const e of h){if(!e.title||!e.blocks.some(d=>d.type!=="heading"))throw new Error(`CHANGELOG.md：${e.id} 缺少更新标题或正文。`);if(m.has(e.id))throw new Error(`CHANGELOG.md：日期与版本重复 ${e.id}。`);m.add(e.id)}return h.sort((e,d)=>d.date.localeCompare(e.date))}const L={viewBox:"0 0 24 24",width:"20",height:"20",fill:"none",stroke:"currentColor","stroke-width":"1.5","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"},Y=["d"],j=w({__name:"HandbookIcon",props:{name:{}},setup(l){const h={book:"M12 7c-3-3-7-3-10-2v14c3-1 7-1 10 2 3-3 7-3 10-2V5c-3-1-7-1-10 2Zm0 0v14M5 8l4 1M5 12l4 1m6-4 4-1m-4 5 4-1","arrow-left":"M19 12H5m6-6-6 6 6 6","arrow-up-right":"M6 18 18 6M6 6h12v12",globe:"M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c5 6 5 14 0 20-5-6-5-14 0-20Z",copy:"M9 9h12v12H9ZM15 5V3H3v12h2",check:"m5 12 4 4L19 6",message:"M21 4H3v13h5l4 4 4-4h5ZM7 8h10M7 12h6",chevron:"m6 9 6 6 6-6",scan:"M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7h3v3H7Zm7 0h3v3h-3ZM7 14h3v3H7Zm7 0h3v3h-3Z"};return(i,t)=>(s(),o("svg",L,[b("path",{d:h[l.name]},null,8,Y)]))}}),E={class:"update-content"},V={key:0},G={key:2},N=w({__name:"ChangelogContent",props:{blocks:{},headingLevel:{default:3}},setup(l){return(h,i)=>(s(),o("div",E,[(s(!0),o(_,null,v(l.blocks,(t,f)=>(s(),o(_,{key:f},[t.type==="list"?(s(),o("ul",V,[(s(!0),o(_,null,v(t.items,(m,e)=>(s(),o("li",{key:e},k(m),1))),128))])):t.type==="heading"?(s(),C($(`h${l.headingLevel}`),{key:1},{default:x(()=>[H(k(t.text),1)]),_:2},1024)):(s(),o("p",G,k(t.text),1))],64))),128))]))}}),A=Z(N,[["__scopeId","data-v-082ed76b"]]),B=`# 更新日志\r
\r
<!--\r
此文件是 Web 与微信小程序更新日志的唯一内容源，两端通过 Vite ?raw 引用，共用 packages/shared 中的解析器。\r
新增记录格式：\r
## YYYY-MM-DD | 版本号 | 发布状态\r
### 更新标题\r
- 更新内容\r
- 更新内容\r
\r
每条记录需包含日期、版本、状态、标题及至少一段内容。\r
正文支持纯文字段落、无序列表，以及 #### 小标题。不使用 HTML 或复杂 Markdown。\r
页面自动按日期倒序排列；同一天保持文档顺序。最新记录默认展开，每批显示 10 条。\r
正式上线后再修改发布状态，不将开发预览标记为正式发布。\r
本地修改文档会更新预览；线上内容随 Web / 小程序各自重新构建和发布更新。\r
新增汉字时按字体覆盖检查提示更新字体子集：node apps/web/scripts/subset-fonts.mjs <字体源目录>。\r
-->\r
\r
## 2026-10-22 | V3 | 正式发布\r
\r
### 多地图与分层交互升级\r
\r
- 按地图、模式、入口筛选布局，自动记住最近选择。\r
- 全图与楼层支持横滑切换，放大后拖到边缘即可继续切层。\r
- 支持缩放、拖拽、旋转与全屏查看，入口参考随时查阅。\r
- 可下载所选地图的离线包；未缓存的内容仍需联网。\r
\r
## 2026-10-04 | 小程序 0.1.0 | 待发布\r
\r
### 微信小程序初版\r
\r
- 提供条件筛选、布局目录、全图与分层地图查看。\r
- 支持手势缩放、边缘横滑切层与微信原生图片预览。\r
- 楼层预览图可缓存复用，减少重复等待。\r
\r
## 2026-08-23 | V2.1.0 | 历史正式版\r
\r
### 多模式与地下室攻略\r
\r
- 支持困难、噩梦模式及对应入口攻略。\r
- 补充地下室地图，整理目录与分享链接。\r
`,S=D(B),F=S[0];export{A as C,j as _,S as c,F as l};
