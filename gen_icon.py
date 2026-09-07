"""生成「家早饭」软件图标 PNG（早餐碗 + 蒸汽 + 蛋黄，极简纯色块）。
纯离线渲染：Pillow 绘制，无外部依赖。"""
from PIL import Image, ImageDraw
import math

S = 1024
BG      = (240, 138, 60)    # 橙（介于 --orange 与 --orange-d 之间，appetizing）
CREAM   = (255, 250, 243)   # --cream 碗体
RIM     = (240, 226, 207)   # 碗口内圈（略深奶油）
YOLK    = (255, 207, 107)   # 蛋黄金
STEAM   = (255, 255, 255, 175)

def rounded_bg(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img, d

def draw_bowl(d):
    # 碗体：下半椭圆（chord 0..180 = 南半，平底圆顶）
    d.chord([212, 370, 812, 830], 0, 180, fill=CREAM)
    # 碗口椭圆（开口感）
    d.ellipse([212, 580, 812, 620], fill=RIM)
    # 蛋黄
    d.ellipse([462, 555, 562, 655], fill=YOLK)

def steam_path(x0, y_top, y_bot, amp, phase):
    pts = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        y = y_bot - t * (y_bot - y_top)
        x = x0 + amp * math.sin(t * math.pi * 2.2 + phase)
        pts.append((x, y))
    return pts

def draw_steam(d):
    # 左、中、右三缕；中间更高
    specs = [
        (440, 215, 545, 20, 0.0),
        (512, 150, 560, 22, 1.1),
        (584, 215, 545, 20, 2.2),
    ]
    for x0, y_top, y_bot, amp, phase in specs:
        d.line(steam_path(x0, y_top, y_bot, amp, phase),
               width=18, fill=STEAM, joint="curve")

def render(path, size):
    img, d = rounded_bg(S, 224, BG)
    draw_bowl(d)
    draw_steam(d)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print("saved", path, img.size)

render("icon.png", 1024)
render("icon-512.png", 512)
