import os
import sys
from PIL import Image

# 全地图一图流约 1.5 亿像素，超过 PIL 默认告警阈值
Image.MAX_IMAGE_PIXELS = None

# 新版全地图一图流（5341x28217）为表格布局：入口方向 | 地图名称 | 入口 | 一楼 | 二楼
# 每张地图入口单元格的行坐标范围 (ymin, ymax)，按图流从上到下排列，共28行
ROWS = [
    (461, 1297), (1309, 2137), (2155, 2981), (2993, 3831), (3843, 4674),
    (4686, 5519), (5530, 6363), (6380, 7204), (7225, 8048), (8060, 8890),
    (8904, 9733), (9755, 10589), (10601, 11444), (11456, 12294), (12317, 13144),
    (13156, 13998), (14010, 14854), (14866, 15689), (15705, 16528), (16540, 17382),
    (17403, 18238), (18250, 19091), (19103, 19945), (19957, 20801), (20813, 21643),
    (21655, 22495), (22511, 23334), (23346, 24173),
]

# 28张地图与行的映射关系（完全按图流中的先后顺序排布）
MAP_ORDER = [
    "右-左上右下门",
    "右-双L门",
    "右-锤子门",
    "右-骑士门",
    "右-L门",
    "右-三L门",
    "左-Y门",
    "左-锤子门",
    "左-倒T门",
    "左-对角门",
    "左-音叉门",
    "左-罐子门",
    "左-对T门",
    "左-Y青蛙房",
    "左-锤灯笼门",
    "南-三缺一门",
    "南-十字门",
    "南-L门",
    "南-红门",
    "南-orz门",
    "北-1门",
    "北-4门",
    "北-红门",
    "北-凹门",
    "北-T门",
    "北-红对角门",
    "北-1沙发门",
    "北-4安全门",
]

# 入口图片在全地图一图流中的列坐标范围（入口列）
ENTRY_X = (1968, 2814)

# WebP 输出质量：q90 对地图截图为视觉无损，体积约为 JPEG q90 的 1/5
WEBP_QUALITY = 90

# 单张原图的一二楼分界 y 坐标（非均分的图需在此登记，其余默认高度对半）
FLOOR_SPLITS = {
    "右-骑士门": 690,
    "右-L门": 895,
    "右-三L门": 752,
    "左-罐子门": 777,
    "左-对T门": 895,
    "左-对角门": 745,
    "左-Y青蛙房": 800,
    "左-锤灯笼门": 784,
    "南-红门": 888,
    "南-orz门": 752,
    "北-1沙发门": 750,
    "北-4安全门": 748,
}


def find_source(name):
    """maps/ 下的原图，兼容带（新增）后缀的文件名，优先 PNG（新版素材），其次 JPG。"""
    for stem in (name, f"{name}（新增）"):
        for ext in (".png", ".jpg"):
            path = os.path.join("maps", f"{stem}{ext}")
            if os.path.exists(path):
                return path
    return None


def main():
    only = set(sys.argv[1:])  # 传入地图名可只处理指定图，如: python crop_images.py 南-orz门
    targets = [n for n in MAP_ORDER if not only or n in only]

    print("开始图片裁剪任务...")

    # 输出到前端资源目录（走 Vite 构建管线，产物带内容哈希）
    out_root = "apps/web/src/assets/maps"
    entry_dir = f"{out_root}/entry"
    floor1_dir = f"{out_root}/floor1"
    floor2_dir = f"{out_root}/floor2"
    full_dir = f"{out_root}/full"
    for d in (entry_dir, floor1_dir, floor2_dir, full_dir):
        os.makedirs(d, exist_ok=True)

    total = len(targets)

    # 1. 从全地图一图流裁剪入口图片 (entry)
    flow_path = "maps/全地图一图流.png"
    if not os.path.exists(flow_path):
        print(f"错误: 未找到全地图一图流图片 {flow_path}")
        sys.exit(1)

    print(f"正在加载全地图一图流: {flow_path}...")
    flow_img = Image.open(flow_path)
    print(f"全地图一图流加载成功, 尺寸: {flow_img.size}")

    xmin, xmax = ENTRY_X
    for idx, name in enumerate(targets):
        ymin, ymax = ROWS[MAP_ORDER.index(name)]

        entry_crop = flow_img.crop((xmin, ymin, xmax, ymax))
        if entry_crop.mode != "RGB":
            entry_crop = entry_crop.convert("RGB")
        entry_save_path = os.path.join(entry_dir, f"{name}.webp")
        entry_crop.save(entry_save_path, "WEBP", quality=WEBP_QUALITY)
        print(f"[{idx+1:02d}/{total}] 已裁剪入口图 -> {entry_save_path} ({entry_crop.size})")

    print("一图流入口图片裁剪完毕。")

    # 2. 从单张原图拆分一楼/二楼 (floor1 & floor2)，并生成完整图 (full)
    for idx, name in enumerate(targets):
        src_path = find_source(name)
        if src_path is None:
            print(f"警告: 未找到地图原图 maps/{name}.(png|jpg)，跳过该图的处理。")
            continue

        map_img = Image.open(src_path)
        w, h = map_img.size
        split = FLOOR_SPLITS.get(name, h // 2)

        if map_img.mode != "RGB":
            map_img = map_img.convert("RGB")

        floor1_crop = map_img.crop((0, 0, w, split))
        floor1_crop.save(os.path.join(floor1_dir, f"{name}.webp"), "WEBP", quality=WEBP_QUALITY)

        floor2_crop = map_img.crop((0, split, w, h))
        floor2_crop.save(os.path.join(floor2_dir, f"{name}.webp"), "WEBP", quality=WEBP_QUALITY)

        # 完整双层图：从原图直接编码 WebP，避免二次压缩
        map_img.save(os.path.join(full_dir, f"{name}.webp"), "WEBP", quality=WEBP_QUALITY)

        print(f"[{idx+1:02d}/{total}] 已拆分 1楼/2楼 + 全图 -> {name} "
              f"({w}x{h}, 分界 y={split})")

    print("\n所有图片裁剪及拆分操作已顺利完成！")
    print(f"入口图目录: {entry_dir} (应含{len(MAP_ORDER)}个文件)")
    print(f"一楼图目录: {floor1_dir} (应含{len(MAP_ORDER)}个文件)")
    print(f"二楼图目录: {floor2_dir} (应含{len(MAP_ORDER)}个文件)")
    print(f"全图目录:   {full_dir} (应含{len(MAP_ORDER)}个文件)")


if __name__ == "__main__":
    main()
