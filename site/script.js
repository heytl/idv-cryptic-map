// ==========================================================================
// 第五人格“加页手记”交互地图逻辑脚本 (script.js)
// ==========================================================================

// 地图基础元数据列表 (做本地兜底，确保离线或 file:// 运行时依然可用)
const MAP_DATA = [
  {
    "id": 1,
    "direction": "左",
    "name": "左-Y门",
    "entryImg": "public/entry/左-Y门.webp",
    "floor1Img": "public/floor1/左-Y门.webp",
    "floor2Img": "public/floor2/左-Y门.webp",
    "remarks": "左侧入口，呈现Y字形墙体结构"
  },
  {
    "id": 2,
    "direction": "左",
    "name": "左-锤子门",
    "entryImg": "public/entry/左-锤子门.webp",
    "floor1Img": "public/floor1/左-锤子门.webp",
    "floor2Img": "public/floor2/左-锤子门.webp",
    "remarks": "左侧入口，呈现锤子形状墙体结构"
  },
  {
    "id": 3,
    "direction": "左",
    "name": "左-倒T门",
    "entryImg": "public/entry/左-倒T门.webp",
    "floor1Img": "public/floor1/左-倒T门.webp",
    "floor2Img": "public/floor2/左-倒T门.webp",
    "remarks": "左侧入口，呈现倒T字形墙体结构"
  },
  {
    "id": 4,
    "direction": "左",
    "name": "左-对角门",
    "entryImg": "public/entry/左-对角门.webp",
    "floor1Img": "public/floor1/左-对角门.webp",
    "floor2Img": "public/floor2/左-对角门.webp",
    "remarks": "左侧入口，呈现对角线墙体结构"
  },
  {
    "id": 5,
    "direction": "左",
    "name": "左-音叉门",
    "entryImg": "public/entry/左-音叉门.webp",
    "floor1Img": "public/floor1/左-音叉门.webp",
    "floor2Img": "public/floor2/左-音叉门.webp",
    "remarks": "左侧入口，呈现音叉状对称墙体结构"
  },
  {
    "id": 6,
    "direction": "左",
    "name": "左-罐子门",
    "entryImg": "public/entry/左-罐子门.webp",
    "floor1Img": "public/floor1/左-罐子门.webp",
    "floor2Img": "public/floor2/左-罐子门.webp",
    "remarks": "左侧入口，呈现罐子状墙体结构"
  },
  {
    "id": 7,
    "direction": "左",
    "name": "左-对T门",
    "entryImg": "public/entry/左-对T门.webp",
    "floor1Img": "public/floor1/左-对T门.webp",
    "floor2Img": "public/floor2/左-对T门.webp",
    "remarks": "左侧入口，呈现两个相对的T形墙体结构"
  },
  {
    "id": 24,
    "direction": "左",
    "name": "左-Y青蛙房（新）",
    "entryImg": "public/entry/左-Y青蛙房.webp",
    "floor1Img": "public/floor1/左-Y青蛙房.webp",
    "floor2Img": "public/floor2/左-Y青蛙房.webp",
    "remarks": "左侧入口，Y字形通道变体，邻接青蛙房结构"
  },
  {
    "id": 8,
    "direction": "右",
    "name": "右-左上右下门",
    "entryImg": "public/entry/右-左上右下门.webp",
    "floor1Img": "public/floor1/右-左上右下门.webp",
    "floor2Img": "public/floor2/右-左上右下门.webp",
    "remarks": "右侧入口，左上及右下方向的侧门结构"
  },
  {
    "id": 9,
    "direction": "右",
    "name": "右-双L门",
    "entryImg": "public/entry/右-双L门.webp",
    "floor1Img": "public/floor1/右-双L门.webp",
    "floor2Img": "public/floor2/右-双L门.webp",
    "remarks": "右侧入口，呈现双L型拐角墙体结构"
  },
  {
    "id": 10,
    "direction": "右",
    "name": "右-锤子门",
    "entryImg": "public/entry/右-锤子门.webp",
    "floor1Img": "public/floor1/右-锤子门.webp",
    "floor2Img": "public/floor2/右-锤子门.webp",
    "remarks": "右侧入口，呈现锤子形状墙体结构"
  },
  {
    "id": 11,
    "direction": "右",
    "name": "右-骑士门",
    "entryImg": "public/entry/右-骑士门.webp",
    "floor1Img": "public/floor1/右-骑士门.webp",
    "floor2Img": "public/floor2/右-骑士门.webp",
    "remarks": "右侧入口，墙体轮廓形似骑士棋子"
  },
  {
    "id": 12,
    "direction": "右",
    "name": "右-L门",
    "entryImg": "public/entry/右-L门.webp",
    "floor1Img": "public/floor1/右-L门.webp",
    "floor2Img": "public/floor2/右-L门.webp",
    "remarks": "右侧入口，呈现L形墙体结构"
  },
  {
    "id": 13,
    "direction": "南",
    "name": "南-三缺一门",
    "entryImg": "public/entry/南-三缺一门.webp",
    "floor1Img": "public/floor1/南-三缺一门.webp",
    "floor2Img": "public/floor2/南-三缺一门.webp",
    "remarks": "南侧入口，三缺一侧墙体结构"
  },
  {
    "id": 14,
    "direction": "南",
    "name": "南-十字门",
    "entryImg": "public/entry/南-十字门.webp",
    "floor1Img": "public/floor1/南-十字门.webp",
    "floor2Img": "public/floor2/南-十字门.webp",
    "remarks": "南侧入口，标准十字形门体与墙体"
  },
  {
    "id": 15,
    "direction": "南",
    "name": "南-L门",
    "entryImg": "public/entry/南-L门.webp",
    "floor1Img": "public/floor1/南-L门.webp",
    "floor2Img": "public/floor2/南-L门.webp",
    "remarks": "南侧入口，L形侧门通道结构"
  },
  {
    "id": 16,
    "direction": "南",
    "name": "南-红门",
    "entryImg": "public/entry/南-红门.webp",
    "floor1Img": "public/floor1/南-红门.webp",
    "floor2Img": "public/floor2/南-红门.webp",
    "remarks": "南侧入口，红色标记危险门体"
  },
  {
    "id": 17,
    "direction": "北",
    "name": "北-1门",
    "entryImg": "public/entry/北-1门.webp",
    "floor1Img": "public/floor1/北-1门.webp",
    "floor2Img": "public/floor2/北-1门.webp",
    "remarks": "北侧入口，单一侧门通道"
  },
  {
    "id": 18,
    "direction": "北",
    "name": "北-4门",
    "entryImg": "public/entry/北-4门.webp",
    "floor1Img": "public/floor1/北-4门.webp",
    "floor2Img": "public/floor2/北-4门.webp",
    "remarks": "北侧入口，4扇侧门结构"
  },
  {
    "id": 19,
    "direction": "北",
    "name": "北-红门",
    "entryImg": "public/entry/北-红门.webp",
    "floor1Img": "public/floor1/北-红门.webp",
    "floor2Img": "public/floor2/北-红门.webp",
    "remarks": "北侧入口，红色标记危险门体"
  },
  {
    "id": 20,
    "direction": "北",
    "name": "北-凹门",
    "entryImg": "public/entry/北-凹门.webp",
    "floor1Img": "public/floor1/北-凹门.webp",
    "floor2Img": "public/floor2/北-凹门.webp",
    "remarks": "北侧入口，呈现凹字形墙体包围结构"
  },
  {
    "id": 21,
    "direction": "北",
    "name": "北-T门",
    "entryImg": "public/entry/北-T门.webp",
    "floor1Img": "public/floor1/北-T门.webp",
    "floor2Img": "public/floor2/北-T门.webp",
    "remarks": "北侧入口，呈现T字形墙体接口"
  },
  {
    "id": 22,
    "direction": "北",
    "name": "北-红对角门",
    "entryImg": "public/entry/北-红对角门.webp",
    "floor1Img": "public/floor1/北-红对角门.webp",
    "floor2Img": "public/floor2/北-红对角门.webp",
    "remarks": "北侧入口，带有红色标识的对角侧门"
  },
  {
    "id": 23,
    "direction": "北",
    "name": "北-1沙发门（新）",
    "entryImg": "public/entry/北-1沙发门.webp",
    "floor1Img": "public/floor1/北-1沙发门.webp",
    "floor2Img": "public/floor2/北-1沙发门.webp",
    "remarks": "北侧入口，单门通道变体，门内带沙发标志物"
  }
];

// 地图高亮房间相对坐标表 (基于图片宽度900x高度750的比例)
const ROOM_COORDINATES = {
  // 右-左上右下门
  "右-左上右下门": {
    "1": {
      "餐厅": { left: 55, top: 12, width: 15, height: 18 },
      "悬空桌": { left: 38, top: 12, width: 12, height: 12 },
      "图书长廊": { left: 27, top: 21, width: 10, height: 19 },
      "断梯房": { left: 10, top: 36, width: 12, height: 13 },
      "谬斯房": { left: 16, top: 52, width: 14, height: 13 }
    },
    "2": {
      "餐厅": { left: 64, top: 11, width: 15, height: 17 },
      "悬空桌": { left: 47, top: 11, width: 12, height: 13 },
      "图书长廊": { left: 36, top: 25, width: 9, height: 18 },
      "会客厅": { left: 22, top: 18, width: 14, height: 15 },
      "断梯房": { left: 19, top: 36, width: 12, height: 13 }
    }
  },
  // 左-Y门
  "左-Y门": {
    "1": {
      "餐厅": { left: 33, top: 15, width: 15, height: 15 },
      "悬空桌": { left: 50, top: 15, width: 12, height: 12 },
      "图书长廊": { left: 28, top: 32, width: 11, height: 18 },
      "谬斯房": { left: 55, top: 33, width: 14, height: 15 }
    },
    "2": {
      "餐厅": { left: 41, top: 12, width: 15, height: 17 },
      "悬空桌": { left: 24, top: 12, width: 12, height: 12 },
      "会客厅": { left: 55, top: 20, width: 14, height: 15 }
    }
  },
  // 南-十字门
  "南-十字门": {
    "1": {
      "餐厅": { left: 52, top: 10, width: 16, height: 17 },
      "悬空桌": { left: 35, top: 10, width: 13, height: 13 },
      "断梯房": { left: 8, top: 32, width: 13, height: 13 },
      "谬斯房": { left: 14, top: 48, width: 14, height: 14 }
    },
    "2": {
      "餐厅": { left: 61, top: 9, width: 15, height: 17 },
      "会客厅": { left: 20, top: 15, width: 14, height: 15 }
    }
  },
  // 北-1门
  "北-1门": {
    "1": {
      "餐厅": { left: 41, top: 7, width: 15, height: 16 },
      "会客厅": { left: 19, top: 7, width: 14, height: 15 },
      "罐子房": { left: 47, top: 16, width: 12, height: 11 },
      "图书长廊": { left: 75, top: 8, width: 9, height: 21 },
      "谬斯房": { left: 69, top: 31, width: 15, height: 13 }
    },
    "2": {
      "餐厅": { left: 45, top: 60, width: 16, height: 17 },
      "罐子房": { left: 52, top: 70, width: 14, height: 13 },
      "图书长廊": { left: 79, top: 62, width: 9, height: 21 }
    }
  }
};

// 缩放配置：最小/最大缩放均为相对“自适应铺满比例(fitScale)”的倍数
// 例如 minScaleRatio: 1 表示最多缩小到刚好铺满视口，maxScaleRatio: 4 表示最多放大到铺满的4倍
const ZOOM_CONFIG = {
  minScaleRatio: 0.8,
  maxScaleRatio: 4,
  wheelZoomFactor: 1.1,  // 滚轮每格缩放倍率
  buttonZoomFactor: 1.3  // 工具栏 +/- 按钮每次缩放倍率
};

// 状态管理
let currentMap = null;
let currentFloor = "full";
// 是否由目录页内点击进入攻略页：是则返回按钮走 history.back()，
// 否则（分享链接直达）返回按钮改为前进到目录，避免退出站点
let enteredFromCatalog = false;
let zoomState = {
  scale: 1,
  x: 0,
  y: 0,
  fitScale: 1 // 当前图片在视口内自适应铺满的基准比例
};

// DOM 元素引用
const catalogView = document.getElementById("catalog-view");
const strategyView = document.getElementById("strategy-view");
const entryGrid = document.getElementById("entry-grid");
const densitySwitch = document.getElementById("density-switch");
const currentMapName = document.getElementById("current-map-name");
const currentMapDirection = document.getElementById("current-map-direction");
const refEntryImg = document.getElementById("ref-entry-img");
const infoDirection = document.getElementById("info-direction");
const infoRemarks = document.getElementById("info-remarks");
const mainMapImg = document.getElementById("main-map-img");
const floorSwitch = document.getElementById("floor-switch");
const roomButtons = document.getElementById("room-buttons");
const highlightOverlay = document.getElementById("highlight-overlay");

const mapViewport = document.getElementById("map-viewport");
const mapWrapper = document.getElementById("map-wrapper");
const backBtn = document.getElementById("back-btn");

// ==========================================================================
// Hash 路由：#/ 目录页 | #/dir/左 目录页+筛选 | #/map/左-Y门/1 攻略页+楼层
// 交互只负责写 hash，渲染统一由 applyRoute 驱动，刷新/分享链接可直达任意状态
// ==========================================================================

const VALID_DIRECTIONS = ["左", "右", "南", "北"];
const BASE_TITLE = document.title;

// 构造攻略页 hash（楼层为"全图"时省略第三段）
function mapHash(name, floor) {
  const floorPart = (floor === "1" || floor === "2") ? `/${floor}` : "";
  return `#/map/${encodeURIComponent(name)}${floorPart}`;
}

// 解析当前 hash；未知地图返回 null 由 applyRoute 兜底回目录
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return { view: "catalog", filter: "all" };

  const parts = raw.split("/").map(decodeURIComponent);
  if (parts[0] === "map" && parts[1]) {
    const map = MAP_DATA.find(m => m.name === parts[1]);
    if (!map) return null;
    const floor = (parts[2] === "1" || parts[2] === "2") ? parts[2] : "full";
    return { view: "strategy", map, floor };
  }
  if (parts[0] === "dir" && VALID_DIRECTIONS.includes(parts[1])) {
    return { view: "catalog", filter: parts[1] };
  }
  return { view: "catalog", filter: "all" };
}

// 路由唯一渲染入口：hash 变化与首次加载都经由此处
function applyRoute() {
  const route = parseRoute();
  if (!route) {
    location.replace("#/");
    return;
  }

  if (route.view === "strategy") {
    selectMap(route.map, route.floor);
  } else {
    document.title = BASE_TITLE;
    applyCatalogFilter(route.filter);
    switchView("catalog");
  }
}

// 初始化入口
document.addEventListener("DOMContentLoaded", () => {
  // 1. 初始化手记目录网格
  renderCatalog(MAP_DATA);

  // 2. 绑定方向过滤事件（replace 写入 hash，筛选状态可随刷新还原且不产生历史记录）
  // 注意选择器必须限定在 .tabs 容器内，避免误绑到筛选栏里的其他控件
  document.querySelectorAll(".tabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const filterValue = btn.getAttribute("data-filter");
      history.replaceState(null, "", filterValue === "all" ? "#/" : `#/dir/${filterValue}`);
      applyCatalogFilter(filterValue);
    });
  });

  // 3. 楼层切换事件（replace 更新 hash 楼层段，返回键仍一步回目录）
  document.querySelectorAll(".switch-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const floor = btn.getAttribute("data-floor");
      if (currentMap) {
        history.replaceState(null, "", mapHash(currentMap.name, floor));
      }
      setFloorUI(floor);
      // 楼层高度改变时由 updateMapFloor 在图片加载后重置缩放自适应
      updateMapFloor();
    });
  });

  // 4. 返回目录按钮
  backBtn.addEventListener("click", () => {
    if (enteredFromCatalog) {
      history.back();
    } else {
      location.hash = "#/";
    }
  });

  // 5. 地图缩放与拖拽初始化
  initMapZoomAndPan();

  // 6. 点击图片外部（即视口黑边背景）退出全屏
  mapViewport.addEventListener("click", (e) => {
    if (mapViewport.classList.contains("in-page-fullscreen") && e.target === mapViewport) {
      toggleFullscreen();
    }
  });

  // 7. 点击右上角关闭按钮 (X) 退出全屏
  const closeFullscreenBtn = document.querySelector(".fullscreen-close-btn");
  closeFullscreenBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发背景点击
    toggleFullscreen();
  });

  // 8. 紧凑视图开关初始化
  initDensityToggle();

  // 9. 路由驱动视图：监听 hash 变化，并按当前 hash 完成首次渲染（刷新/直达链接）
  window.addEventListener("hashchange", applyRoute);
  applyRoute();
});

// 渲染目录列表
function renderCatalog(data) {
  entryGrid.innerHTML = "";
  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "map-card-item";
    card.setAttribute("data-dir", item.direction);
    card.innerHTML = `
      <div class="img-wrapper">
        <img src="${item.entryImg}" alt="${item.name}" loading="lazy">
      </div>
      <div class="map-card-info">
        <div class="map-card-name">${item.name}</div>
        <div class="map-card-dir">${item.direction}侧入口</div>
      </div>
    `;
    card.addEventListener("click", () => {
      enteredFromCatalog = true;
      location.hash = mapHash(item.name, "full");
    });
    entryGrid.appendChild(card);
  });
}

// 紧凑视图偏好的 localStorage 键（设备个人偏好，不进路由 hash）
const DENSITY_STORAGE_KEY = "idv-catalog-compact";

// 应用卡片密度：网格紧凑类、滑块位置、两段按钮的激活与无障碍状态一并同步
function applyDensity(compact) {
  entryGrid.classList.toggle("compact", compact);
  densitySwitch.classList.toggle("compact-active", compact);
  densitySwitch.querySelectorAll(".density-opt").forEach(btn => {
    const isActive = (btn.getAttribute("data-density") === "compact") === compact;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

// 初始化密度切换器：读取偏好、绑定两段点击（localStorage 在部分隐私模式下不可用，故做容错）
function initDensityToggle() {
  let compactPref = false;
  try {
    compactPref = localStorage.getItem(DENSITY_STORAGE_KEY) === "1";
  } catch (e) { /* 读取失败按默认标准视图处理 */ }
  applyDensity(compactPref);

  densitySwitch.querySelectorAll(".density-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const compact = btn.getAttribute("data-density") === "compact";
      applyDensity(compact);
      try {
        localStorage.setItem(DENSITY_STORAGE_KEY, compact ? "1" : "0");
      } catch (e) { /* 写入失败仅本次会话生效 */ }
    });
  });
}

// 同步方向筛选按钮激活态并执行筛选
function applyCatalogFilter(filter) {
  document.querySelectorAll(".tabs .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === filter);
  });
  filterCatalog(filter);
}

// 筛选目录
function filterCatalog(filter) {
  const cards = document.querySelectorAll(".map-card-item");
  cards.forEach(card => {
    const dir = card.getAttribute("data-dir");
    if (filter === "all" || dir === filter) {
      card.style.display = "flex";
      setTimeout(() => card.style.opacity = "1", 50);
    } else {
      card.style.opacity = "0";
      setTimeout(() => card.style.display = "none", 200);
    }
  });
}

// 视图切换
function switchView(viewName) {
  if (viewName === "catalog") {
    document.body.classList.remove("strategy-view-active");
    strategyView.classList.remove("active");
    setTimeout(() => {
      catalogView.classList.add("active");
    }, 200);
  } else {
    document.body.classList.add("strategy-view-active");
    catalogView.classList.remove("active");
    setTimeout(() => {
      strategyView.classList.add("active");
      // 切换到策略页时自适应地图尺寸
      resetMapTransform();
    }, 200);
  }
}

// 同步楼层滑块 UI 与当前楼层状态
function setFloorUI(floor) {
  currentFloor = floor;
  document.querySelectorAll(".switch-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-floor") === floor);
  });
  floorSwitch.classList.remove("floor-1-active", "floor-2-active");
  if (floor === "1") {
    floorSwitch.classList.add("floor-1-active");
  } else if (floor === "2") {
    floorSwitch.classList.add("floor-2-active");
  }
}

// 渲染攻略页详情（路由直达与目录点击共用此入口）
function selectMap(map, floor = "full") {
  currentMap = map;
  setFloorUI(floor);
  document.title = `${map.name} | ${BASE_TITLE}`;

  // 更新文本和侧门参考图
  currentMapName.textContent = map.name;
  currentMapDirection.textContent = `${map.direction}侧入口`;
  refEntryImg.src = map.entryImg;
  infoDirection.textContent = `${map.direction}侧门`;
  infoRemarks.textContent = map.remarks;

  // 更新一二楼地图图片源
  updateMapFloor();

  // 隐藏高亮
  hideHighlight();

  // 切换面板视图
  switchView("strategy");
}

// 切换一二楼图片源
function updateMapFloor() {
  if (!currentMap) return;

  // 地图一楼、二楼和全图地址
  const imgUrl = currentFloor === "1" ? currentMap.floor1Img :
                 currentFloor === "2" ? currentMap.floor2Img :
                 `public/full/${currentMap.name}.webp`;
  mainMapImg.src = imgUrl;

  // 图片尺寸不再统一（新图有 1650/1700/1800 等高度），
  // 待图片加载后按自然尺寸设置 wrapper 并重新自适应铺满
  if (mainMapImg.complete && mainMapImg.naturalWidth > 0) {
    fitWrapperToImage();
  } else {
    mainMapImg.onload = () => fitWrapperToImage();
  }

  // 隐藏之前的区域高亮
  hideHighlight();

  // 渲染当前地图楼层对应的房间高亮按钮
  renderRoomButtons();
}

// 按当前图片自然尺寸设置 mapWrapper 大小并重置缩放居中
function fitWrapperToImage() {
  mapWrapper.style.width = `${mainMapImg.naturalWidth}px`;
  mapWrapper.style.height = `${mainMapImg.naturalHeight}px`;
  resetMapTransform();
}

// 渲染房间快速高亮按钮
function renderRoomButtons() {
  roomButtons.innerHTML = "";
  
  // 检查是否有该地图和该楼层的高亮坐标数据
  const mapCoords = ROOM_COORDINATES[currentMap.name];
  if (!mapCoords || !mapCoords[currentFloor]) {
    // 如果无专有数据，则渲染默认常用房间进行概念演示
    const defaultRooms = ["客厅", "餐厅", "走廊", "楼梯口"];
    defaultRooms.forEach(room => {
      const btn = document.createElement("button");
      btn.className = "room-btn";
      btn.textContent = room;
      btn.addEventListener("click", () => {
        alert(`已指向: ${room} (当前小抄图层未配置该点精确矢量坐标，可参照图上文字寻找)`);
      });
      roomButtons.appendChild(btn);
    });
    return;
  }

  const floorCoords = mapCoords[currentFloor];
  Object.keys(floorCoords).forEach(roomName => {
    const btn = document.createElement("button");
    btn.className = "room-btn";
    btn.textContent = roomName;
    btn.addEventListener("click", () => {
      const activeBtn = roomButtons.querySelector(".room-btn.active");
      if (activeBtn === btn) {
        // 如果重复点击已激活的按钮，取消高亮
        btn.classList.remove("active");
        hideHighlight();
      } else {
        // 激活高亮
        if (activeBtn) activeBtn.classList.remove("active");
        btn.classList.add("active");
        showHighlight(roomName, floorCoords[roomName]);
      }
    });
    roomButtons.appendChild(btn);
  });
}

// 显示房间高亮并自动聚焦
function showHighlight(roomName, coords) {
  // coords 结构为 { left: 百分比, top: 百分比, width: 百分比, height: 百分比 }
  highlightOverlay.style.left = `${coords.left}%`;
  highlightOverlay.style.top = `${coords.top}%`;
  highlightOverlay.style.width = `${coords.width}%`;
  highlightOverlay.style.height = `${coords.height}%`;
  highlightOverlay.style.display = "block";
  
  // 动效：让地图包装器位移，聚焦在 highlight 的中心
  // 转换百分比坐标为像素坐标 (取当前图片的自然尺寸)
  const mapW = mainMapImg.naturalWidth || 900;
  const mapH = mainMapImg.naturalHeight || 750;
  const targetX = (coords.left + coords.width / 2) / 100 * mapW;
  const targetY = (coords.top + coords.height / 2) / 100 * mapH;
  
  // 获取视口中心点
  const viewW = mapViewport.clientWidth;
  const viewH = mapViewport.clientHeight;
  
  // 计算在特定 scale 下需要位移的值，使中心对齐视口中心
  // 聚焦时自动拉近到铺满比例的2倍，使看清房间（受缩放上下限约束）
  zoomState.scale = clampScale(zoomState.fitScale * 2);
  zoomState.x = viewW / 2 - targetX * zoomState.scale;
  zoomState.y = viewH / 2 - targetY * zoomState.scale;

  applyTransform();
}

// 隐藏高亮
function hideHighlight() {
  highlightOverlay.style.display = "none";
  const activeBtn = roomButtons.querySelector(".room-btn.active");
  if (activeBtn) activeBtn.classList.remove("active");
}

// ==========================================================================
// 地图拖拽缩放平移交互逻辑
// ==========================================================================

// 当前地图图片的自然尺寸 (带兜底值)
function getMapSize() {
  return {
    width: mainMapImg.naturalWidth || 900,
    height: mainMapImg.naturalHeight || (currentFloor === "full" ? 1500 : 750)
  };
}

// 将缩放比例约束在 [fitScale * min, fitScale * max] 区间内
function clampScale(scale) {
  const min = zoomState.fitScale * ZOOM_CONFIG.minScaleRatio;
  const max = zoomState.fitScale * ZOOM_CONFIG.maxScaleRatio;
  return Math.min(Math.max(scale, min), max);
}

// 将平移位置约束在地图边界内：
// 某轴上缩放后的地图小于视口时居中，大于视口时不允许边缘拖进视口内
function clampPosition() {
  const viewW = mapViewport.clientWidth;
  const viewH = mapViewport.clientHeight;
  const { width, height } = getMapSize();
  const scaledW = width * zoomState.scale;
  const scaledH = height * zoomState.scale;

  if (scaledW <= viewW) {
    zoomState.x = (viewW - scaledW) / 2;
  } else {
    zoomState.x = Math.min(Math.max(zoomState.x, viewW - scaledW), 0);
  }

  if (scaledH <= viewH) {
    zoomState.y = (viewH - scaledH) / 2;
  } else {
    zoomState.y = Math.min(Math.max(zoomState.y, viewH - scaledH), 0);
  }
}

// 以视口内某点 (pointX, pointY) 为锚点缩放到 newScale，锚点下的地图内容保持不动
function zoomAt(pointX, pointY, newScale) {
  newScale = clampScale(newScale);
  const mapX = (pointX - zoomState.x) / zoomState.scale;
  const mapY = (pointY - zoomState.y) / zoomState.scale;
  zoomState.scale = newScale;
  zoomState.x = pointX - mapX * newScale;
  zoomState.y = pointY - mapY * newScale;
  applyTransform();
}

function initMapZoomAndPan() {
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  // 鼠标拖拽
  mapViewport.addEventListener("mousedown", (e) => {
    // 只有左键拖拽
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX - zoomState.x;
    startY = e.clientY - zoomState.y;
    mapViewport.style.cursor = "grabbing";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    zoomState.x = e.clientX - startX;
    zoomState.y = e.clientY - startY;
    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      mapViewport.style.cursor = "grab";
    }
  });

  // 触摸拖拽（手机端/iPad）
  let touchStartDist = 0;
  let touchStartScale = 1;
  let pinchMapX = 0; // 捏合起始中点对应的地图坐标
  let pinchMapY = 0;

  mapViewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX - zoomState.x;
      startY = e.touches[0].clientY - zoomState.y;
    } else if (e.touches.length === 2) {
      // 双指缩放
      isDragging = false;
      touchStartDist = getTouchDistance(e.touches);
      touchStartScale = zoomState.scale;
      const mid = getTouchMidpoint(e.touches);
      pinchMapX = (mid.x - zoomState.x) / zoomState.scale;
      pinchMapY = (mid.y - zoomState.y) / zoomState.scale;
    }
  });

  mapViewport.addEventListener("touchmove", (e) => {
    if (isDragging && e.touches.length === 1) {
      zoomState.x = e.touches[0].clientX - startX;
      zoomState.y = e.touches[0].clientY - startY;
      applyTransform();
      e.preventDefault();
    } else if (e.touches.length === 2) {
      // 双指捏合缩放：以两指中点为锚点，同时支持双指平移
      const dist = getTouchDistance(e.touches);
      if (dist > 0 && touchStartDist > 0) {
        const mid = getTouchMidpoint(e.touches);
        zoomState.scale = clampScale(touchStartScale * (dist / touchStartDist));
        zoomState.x = mid.x - pinchMapX * zoomState.scale;
        zoomState.y = mid.y - pinchMapY * zoomState.scale;
        applyTransform();
      }
      e.preventDefault();
    }
  });

  mapViewport.addEventListener("touchend", (e) => {
    if (e.touches.length === 1) {
      // 双指抬起一指后无缝转为单指拖拽
      isDragging = true;
      startX = e.touches[0].clientX - zoomState.x;
      startY = e.touches[0].clientY - zoomState.y;
    } else {
      isDragging = false;
    }
  });

  // 鼠标滚轮缩放 (以指针位置为锚点)
  mapViewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = mapViewport.getBoundingClientRect();
    const factor = e.deltaY < 0 ? ZOOM_CONFIG.wheelZoomFactor : 1 / ZOOM_CONFIG.wheelZoomFactor;
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, zoomState.scale * factor);
  }, { passive: false });

  // 工具栏按钮控制 (以视口中心为锚点)
  document.querySelector(".zoom-in-btn").addEventListener("click", () => {
    zoomAt(mapViewport.clientWidth / 2, mapViewport.clientHeight / 2,
           zoomState.scale * ZOOM_CONFIG.buttonZoomFactor);
  });

  document.querySelector(".zoom-out-btn").addEventListener("click", () => {
    zoomAt(mapViewport.clientWidth / 2, mapViewport.clientHeight / 2,
           zoomState.scale / ZOOM_CONFIG.buttonZoomFactor);
  });

  document.querySelector(".reset-btn").addEventListener("click", () => {
    resetMapTransform();
  });

  document.querySelector(".fullscreen-btn").addEventListener("click", () => {
    toggleFullscreen();
  });
}

// 重置平移缩放 (铺满自适应并居中，同时刷新缩放基准比例)
function resetMapTransform() {
  const viewW = mapViewport.clientWidth;
  const viewH = mapViewport.clientHeight;
  const { width: mapW, height: mapH } = getMapSize();

  // 选择最限制的轴向比例作为自适应铺满基准
  zoomState.fitScale = Math.min(viewW / mapW, viewH / mapH);
  zoomState.scale = zoomState.fitScale;

  // 水平与垂直完全居中对齐
  zoomState.x = (viewW - mapW * zoomState.scale) / 2;
  zoomState.y = (viewH - mapH * zoomState.scale) / 2;

  applyTransform();
}

// 切换页面内全屏模式 (使地图视口铺满整个浏览器窗口)
function toggleFullscreen() {
  const isCurrentlyFullscreen = mapViewport.classList.contains("in-page-fullscreen");
  
  if (!isCurrentlyFullscreen) {
    mapViewport.classList.add("in-page-fullscreen");
  } else {
    mapViewport.classList.remove("in-page-fullscreen");
  }
  
  // 视口大小发生变化，重新自适应计算居中
  setTimeout(() => {
    resetMapTransform();
  }, 80);
}

// 触摸点距离计算
function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 双指中点 (相对视口左上角的坐标)
function getTouchMidpoint(touches) {
  const rect = mapViewport.getBoundingClientRect();
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
    y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
  };
}

// 应用 transform 到 DOM (统一在此处做边界约束，任何入口都不会越界)
function applyTransform() {
  clampPosition();
  mapWrapper.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
}
