import os
import sys
from PIL import Image

def main():
    print("开始图片裁剪任务...")
    
    # 确保输出目录存在
    entry_dir = "public/entry"
    floor1_dir = "public/floor1"
    floor2_dir = "public/floor2"
    
    os.makedirs(entry_dir, exist_ok=True)
    os.makedirs(floor1_dir, exist_ok=True)
    os.makedirs(floor2_dir, exist_ok=True)
    
    # 全地图一图流的行高峰点坐标（共18个点，划分出17个区间）
    peaks = [
        460, 1299, 2142, 2990, 3834, 4683, 5524, 6376, 
        7210, 8049, 8899, 9752, 10593, 11453, 12309, 13151, 
        13998, 14862
    ]
    
    # 17张地图与行数的映射关系（完全按图流中的先后顺序排布）
    map_names = [
        "右-左上右下门",
        "右-双L门",
        "右-锤子门",
        "左-Y门",
        "左-锤子门",
        "左-倒T门",
        "左-对角门",
        "左-音叉门",
        "南-三缺一门",
        "南-十字门",
        "南-L门",
        "北-1门",
        "北-4门",
        "北-红门",
        "北-凹门",
        "北-T门",
        "北-红对角门"
    ]
    
    # 打开全地图一图流
    flow_path = "maps/全地图一图流.png"
    if not os.path.exists(flow_path):
        print(f"错误: 未找到全地图一图流图片 {flow_path}")
        sys.exit(1)
        
    print(f"正在加载全地图一图流: {flow_path}...")
    flow_img = Image.open(flow_path)
    print(f"全地图一图流加载成功, 尺寸: {flow_img.size}")
    
    # 1. 裁剪入口图片 (entry)
    # 入口图片在全地图一图流中的列坐标为 x: 1970 到 2810
    xmin, xmax = 1970, 2810
    
    for idx, name in enumerate(map_names):
        ymin = peaks[idx]
        ymax = peaks[idx+1]
        
        # 裁剪 Column 2 对应的入口图片
        entry_crop = flow_img.crop((xmin, ymin, xmax, ymax))
        entry_save_path = os.path.join(entry_dir, f"{name}.png")
        entry_crop.save(entry_save_path, "PNG")
        print(f"[{idx+1:02d}/17] 已裁剪入口图 -> {entry_save_path} ({entry_crop.size})")
        
    print("一图流入口图片裁剪完毕。")
    
    # 2. 裁剪一楼和二楼地图 (floor1 & floor2)
    # 从 maps/ 目录下的各张 JPG 图片（900x1500）中裁剪一二楼
    # midPoint 设为 750，0-750 为一楼，750-1500 为二楼
    for idx, name in enumerate(map_names):
        jpg_name = f"{name}.jpg"
        jpg_path = os.path.join("maps", jpg_name)
        
        if not os.path.exists(jpg_path):
            print(f"警告: 未找到地图图片 {jpg_path}，跳过该图的一二楼裁剪。")
            continue
            
        map_img = Image.open(jpg_path)
        
        # 裁剪一楼 (0 to 750)
        floor1_crop = map_img.crop((0, 0, 900, 750))
        floor1_save_path = os.path.join(floor1_dir, f"{name}.jpg")
        floor1_crop.save(floor1_save_path, "JPEG")
        
        # 裁剪二楼 (750 to 1500)
        floor2_crop = map_img.crop((0, 750, 900, 1500))
        floor2_save_path = os.path.join(floor2_dir, f"{name}.jpg")
        floor2_crop.save(floor2_save_path, "JPEG")
        
        print(f"[{idx+1:02d}/17] 已拆分 1楼/2楼 -> {name} ({map_img.size} -> 2x 900x750)")
        
    print("\n所有图片裁剪及拆分操作已顺利完成！")
    print(f"入口图目录: {entry_dir} (应含17个文件)")
    print(f"一楼图目录: {floor1_dir} (应含17个文件)")
    print(f"二楼图目录: {floor2_dir} (应含17个文件)")

if __name__ == "__main__":
    main()
