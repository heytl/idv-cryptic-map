// ==========================================================================
// 第五人格“加页手记”交互地图逻辑脚本 (script.js)
// ==========================================================================

// 地图基础元数据列表 (做本地兜底，确保离线或 file:// 运行时依然可用)
const MAP_DATA = [
  {
    "id": 1,
    "direction": "左",
    "name": "左-Y门",
    "entryImg": "public/entry/左-Y门.png",
    "floor1Img": "public/floor1/左-Y门.jpg",
    "floor2Img": "public/floor2/左-Y门.jpg",
    "remarks": "左侧入口，呈现Y字形墙体结构"
  },
  {
    "id": 2,
    "direction": "左",
    "name": "左-锤子门",
    "entryImg": "public/entry/左-锤子门.png",
    "floor1Img": "public/floor1/左-锤子门.jpg",
    "floor2Img": "public/floor2/左-锤子门.jpg",
    "remarks": "左侧入口，呈现锤子形状墙体结构"
  },
  {
    "id": 3,
    "direction": "左",
    "name": "左-倒T门",
    "entryImg": "public/entry/左-倒T门.png",
    "floor1Img": "public/floor1/左-倒T门.jpg",
    "floor2Img": "public/floor2/左-倒T门.jpg",
    "remarks": "左侧入口，呈现倒T字形墙体结构"
  },
  {
    "id": 4,
    "direction": "左",
    "name": "左-对角门",
    "entryImg": "public/entry/左-对角门.png",
    "floor1Img": "public/floor1/左-对角门.jpg",
    "floor2Img": "public/floor2/左-对角门.jpg",
    "remarks": "左侧入口，呈现对角线墙体结构"
  },
  {
    "id": 5,
    "direction": "左",
    "name": "左-音叉门",
    "entryImg": "public/entry/左-音叉门.png",
    "floor1Img": "public/floor1/左-音叉门.jpg",
    "floor2Img": "public/floor2/左-音叉门.jpg",
    "remarks": "左侧入口，呈现音叉状对称墙体结构"
  },
  {
    "id": 6,
    "direction": "右",
    "name": "右-左上右下门",
    "entryImg": "public/entry/右-左上右下门.png",
    "floor1Img": "public/floor1/右-左上右下门.jpg",
    "floor2Img": "public/floor2/右-左上右下门.jpg",
    "remarks": "右侧入口，左上及右下方向的侧门结构"
  },
  {
    "id": 7,
    "direction": "右",
    "name": "右-双L门",
    "entryImg": "public/entry/右-双L门.png",
    "floor1Img": "public/floor1/右-双L门.jpg",
    "floor2Img": "public/floor2/右-双L门.jpg",
    "remarks": "右侧入口，呈现双L型拐角墙体结构"
  },
  {
    "id": 8,
    "direction": "右",
    "name": "右-锤子门",
    "entryImg": "public/entry/右-锤子门.png",
    "floor1Img": "public/floor1/右-锤子门.jpg",
    "floor2Img": "public/floor2/右-锤子门.jpg",
    "remarks": "右侧入口，呈现锤子形状墙体结构"
  },
  {
    "id": 9,
    "direction": "南",
    "name": "南-三缺一门",
    "entryImg": "public/entry/南-三缺一门.png",
    "floor1Img": "public/floor1/南-三缺一门.jpg",
    "floor2Img": "public/floor2/南-三缺一门.jpg",
    "remarks": "南侧入口，三缺一侧墙体结构"
  },
  {
    "id": 10,
    "direction": "南",
    "name": "南-十字门",
    "entryImg": "public/entry/南-十字门.png",
    "floor1Img": "public/floor1/南-十字门.jpg",
    "floor2Img": "public/floor2/南-十字门.jpg",
    "remarks": "南侧入口，标准十字形门体与墙体"
  },
  {
    "id": 11,
    "direction": "南",
    "name": "南-L门",
    "entryImg": "public/entry/南-L门.png",
    "floor1Img": "public/floor1/南-L门.jpg",
    "floor2Img": "public/floor2/南-L门.jpg",
    "remarks": "南侧入口，L形侧门通道结构"
  },
  {
    "id": 12,
    "direction": "北",
    "name": "北-1门",
    "entryImg": "public/entry/北-1门.png",
    "floor1Img": "public/floor1/北-1门.jpg",
    "floor2Img": "public/floor2/北-1门.jpg",
    "remarks": "北侧入口，单一侧门通道"
  },
  {
    "id": 13,
    "direction": "北",
    "name": "北-4门",
    "entryImg": "public/entry/北-4门.png",
    "floor1Img": "public/floor1/北-4门.jpg",
    "floor2Img": "public/floor2/北-4门.jpg",
    "remarks": "北侧入口，4扇侧门结构"
  },
  {
    "id": 14,
    "direction": "北",
    "name": "北-红门",
    "entryImg": "public/entry/北-红门.png",
    "floor1Img": "public/floor1/北-红门.jpg",
    "floor2Img": "public/floor2/北-红门.jpg",
    "remarks": "北侧入口，红色标记危险门体"
  },
  {
    "id": 15,
    "direction": "北",
    "name": "北-凹门",
    "entryImg": "public/entry/北-凹门.png",
    "floor1Img": "public/floor1/北-凹门.jpg",
    "floor2Img": "public/floor2/北-凹门.jpg",
    "remarks": "北侧入口，呈现凹字形墙体包围结构"
  },
  {
    "id": 16,
    "direction": "北",
    "name": "北-T门",
    "entryImg": "public/entry/北-T门.png",
    "floor1Img": "public/floor1/北-T门.jpg",
    "floor2Img": "public/floor2/北-T门.jpg",
    "remarks": "北侧入口，呈现T字形墙体接口"
  },
  {
    "id": 17,
    "direction": "北",
    "name": "北-红对角门",
    "entryImg": "public/entry/北-红对角门.png",
    "floor1Img": "public/floor1/北-红对角门.jpg",
    "floor2Img": "public/floor2/北-红对角门.jpg",
    "remarks": "北侧入口，带有红色标识的对角侧门"
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

// 状态管理
let currentMap = null;
let currentFloor = "full";
let zoomState = {
  scale: 1,
  x: 0,
  y: 0
};

// DOM 元素引用
const catalogView = document.getElementById("catalog-view");
const strategyView = document.getElementById("strategy-view");
const entryGrid = document.getElementById("entry-grid");
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

// 初始化入口
document.addEventListener("DOMContentLoaded", () => {
  // 1. 初始化手记目录网格
  renderCatalog(MAP_DATA);
  
  // 2. 绑定方向过滤事件
  const filterButtons = document.querySelectorAll(".tab-btn");
  filterButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filterValue = btn.getAttribute("data-filter");
      filterCatalog(filterValue);
    });
  });

  // 3. 楼层切换事件
  const switchBtns = document.querySelectorAll(".switch-btn");
  switchBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      switchBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFloor = btn.getAttribute("data-floor");
      
      // 清空旧样式类，并根据新楼层状态添加对应位置的滑块类
      floorSwitch.classList.remove("floor-1-active", "floor-2-active");
      if (currentFloor === "1") {
        floorSwitch.classList.add("floor-1-active");
      } else if (currentFloor === "2") {
        floorSwitch.classList.add("floor-2-active");
      }
      
      updateMapFloor();
      resetMapTransform(); // 楼层高度改变时重置缩放自适应！非常关键！
    });
  });

  // 4. 返回目录按钮
  backBtn.addEventListener("click", () => {
    switchView("catalog");
  });

  // 5. 地图缩放与拖拽初始化
  initMapZoomAndPan();
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
    card.addEventListener("click", () => selectMap(item));
    entryGrid.appendChild(card);
  });
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
    strategyView.classList.remove("active");
    setTimeout(() => {
      catalogView.classList.add("active");
    }, 200);
  } else {
    catalogView.classList.remove("active");
    setTimeout(() => {
      strategyView.classList.add("active");
      // 切换到策略页时自适应地图尺寸
      resetMapTransform();
    }, 200);
  }
}

// 选中地图，加载详情
function selectMap(map) {
  currentMap = map;
  currentFloor = "full";
  
  // 恢复楼层滑块到“全图”
  const switchBtns = document.querySelectorAll(".switch-btn");
  switchBtns.forEach(btn => {
    if (btn.getAttribute("data-floor") === "full") btn.classList.add("active");
    else btn.classList.remove("active");
  });
  floorSwitch.classList.remove("floor-1-active", "floor-2-active");

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
                 `public/full/${currentMap.name}.jpg`;
  mainMapImg.src = imgUrl;

  // 更新 mapWrapper 的高度限制
  if (currentFloor === "full") {
    mapWrapper.style.height = "1500px";
  } else {
    mapWrapper.style.height = "750px";
  }

  // 隐藏之前的区域高亮
  hideHighlight();

  // 渲染当前地图楼层对应的房间高亮按钮
  renderRoomButtons();
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
  // 转换百分比坐标为像素坐标 (地图 wrapper 本身是 900x750 尺寸)
  const mapW = 900;
  const mapH = 750;
  const targetX = (coords.left + coords.width / 2) / 100 * mapW;
  const targetY = (coords.top + coords.height / 2) / 100 * mapH;
  
  // 获取视口中心点
  const viewW = mapViewport.clientWidth;
  const viewH = mapViewport.clientHeight;
  
  // 计算在特定 scale 下需要位移的值，使中心对齐视口中心
  // 聚焦时自动拉近到 1.5 倍缩放，使看清房间
  zoomState.scale = 1.5;
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
    }
  });

  mapViewport.addEventListener("touchmove", (e) => {
    if (isDragging && e.touches.length === 1) {
      zoomState.x = e.touches[0].clientX - startX;
      zoomState.y = e.touches[0].clientY - startY;
      applyTransform();
      e.preventDefault();
    } else if (e.touches.length === 2) {
      // 双指捏合缩放
      const dist = getTouchDistance(e.touches);
      if (dist > 0 && touchStartDist > 0) {
        const factor = dist / touchStartDist;
        zoomState.scale = Math.min(Math.max(touchStartScale * factor, 0.5), 4);
        applyTransform();
      }
      e.preventDefault();
    }
  });

  mapViewport.addEventListener("touchend", () => {
    isDragging = false;
  });

  // 鼠标滚轮缩放
  mapViewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const mouseX = e.clientX - mapViewport.getBoundingClientRect().left;
    const mouseY = e.clientY - mapViewport.getBoundingClientRect().top;
    
    // 计算在放大/缩小前，鼠标相对于地图 wrapper 的比例坐标
    const mapMouseX = (mouseX - zoomState.x) / zoomState.scale;
    const mapMouseY = (mouseY - zoomState.y) / zoomState.scale;
    
    // 缩放计算
    if (e.deltaY < 0) {
      zoomState.scale = Math.min(zoomState.scale + zoomIntensity, 4);
    } else {
      zoomState.scale = Math.max(zoomState.scale - zoomIntensity, 0.5);
    }
    
    // 平移校正：使鼠标指针悬停点在缩放后保持在相同坐标
    zoomState.x = mouseX - mapMouseX * zoomState.scale;
    zoomState.y = mouseY - mapMouseY * zoomState.scale;
    
    applyTransform();
  }, { passive: false });

  // 工具栏按钮控制
  document.querySelector(".zoom-in-btn").addEventListener("click", () => {
    zoomState.scale = Math.min(zoomState.scale + 0.3, 4);
    applyTransform();
  });

  document.querySelector(".zoom-out-btn").addEventListener("click", () => {
    zoomState.scale = Math.max(zoomState.scale - 0.3, 0.5);
    applyTransform();
  });

  document.querySelector(".reset-btn").addEventListener("click", () => {
    resetMapTransform();
  });

  document.querySelector(".fit-height-btn").addEventListener("click", () => {
    fitMapToHeight();
  });
}

// 重置平移缩放
function resetMapTransform() {
  const viewW = mapViewport.clientWidth;
  const viewH = mapViewport.clientHeight;
  const mapW = 900;
  const mapH = currentFloor === "full" ? 1500 : 750;
  
  // 计算自适应缩放比 (Contain 适应)
  const scaleX = viewW / mapW;
  const scaleY = viewH / mapH;
  zoomState.scale = Math.min(scaleX, scaleY, 1.0); // 最大不超过1:1原尺寸
  
  // 居中显示
  zoomState.x = (viewW - mapW * zoomState.scale) / 2;
  zoomState.y = (viewH - mapH * zoomState.scale) / 2;
  
  applyTransform();
}

// 高度完全铺满视口
function fitMapToHeight() {
  const viewW = mapViewport.clientWidth;
  const viewH = mapViewport.clientHeight;
  const mapW = 900;
  const mapH = currentFloor === "full" ? 1500 : 750;
  
  // 缩放比例设为高度比例，使上下刚好铺满
  zoomState.scale = viewH / mapH;
  
  // 居中水平平移，垂直平移设为 0
  zoomState.x = (viewW - mapW * zoomState.scale) / 2;
  zoomState.y = 0;
  
  applyTransform();
}

// 触摸点距离计算
function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 应用 transform 到 DOM
function applyTransform() {
  mapWrapper.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
}
