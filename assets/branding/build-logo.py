from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONT = ROOT / "node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2"

def outline(text, weight, x, baseline, size):
    font = instantiateVariableFont(TTFont(FONT), {"wght": weight}, inplace=True)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    paths = []
    previous = ""
    for char in text:
        x += {"To": -3.0, "ov": -1.1, "va": -1.2}.get(previous + char, 0)
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        paths.append('<path d="' + pen.getCommands() + '"/>')
        x += font['hmtx'][name][0] * scale
        previous = char
    return "".join(paths), x

# Routed T: transparent channel, two teal network endpoints, no filters or gradients.
MARK = '''<defs><mask id="route"><rect width="120" height="120" fill="white"/><path d="M43 82V46Q43 30 59 30H86" fill="none" stroke="black" stroke-width="9" stroke-linecap="round"/><circle cx="43" cy="82" r="11" fill="black"/><circle cx="86" cy="30" r="11" fill="black"/></mask></defs><path d="M20 12H108Q115 12 112 19L101 41Q99 45 94 45H64L54 101Q53 107 47 107H19Q12 107 14 100L24 45H4Q-2 45 1 39L13 17Q15 12 20 12Z" fill="#165BFF" mask="url(#route)"/><circle cx="43" cy="82" r="7.6" fill="#00B9A6"/><circle cx="86" cy="30" r="7.6" fill="#00B9A6"/>'''
name, end = outline("Topova", 720, 140, 91, 86)
ai, end = outline("AI", 460, end + 19, 91, 82)
width = round(end + 10)
for variant, ink in [("light", "#081A35"), ("dark", "#F2F5FC")]:
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="{round(1800 * 120 / width)}" viewBox="0 0 {width} 120" role="img" aria-labelledby="title"><title id="title">Topova AI</title>{MARK}<g fill="{ink}">{name}{ai}</g></svg>'''
    (OUT / f"topova-logo-{variant}.svg").write_text(svg, encoding="utf-8")
(OUT / "topova-icon.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-5 0 125 125" role="img" aria-label="Topova AI">{MARK}</svg>', encoding="utf-8")
print("Created outlined SVG masters and standalone icon.")
