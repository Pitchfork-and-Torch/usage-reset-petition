"""Raster share card and apple touch icon. ASCII text only."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
KIT = Path.home() / "design-assets" / "fontshare"
BOLD = KIT / "clash-display" / "otf" / "ClashDisplay-Bold.otf"
SEMI = KIT / "clash-display" / "otf" / "ClashDisplay-Semibold.otf"
MED = KIT / "satoshi" / "otf" / "Satoshi-Medium.otf"

PAPER = (244, 241, 234)
INK = (28, 27, 22)
STAMP = (142, 29, 29)
MUTED = (63, 59, 52)


def font(path, size):
    return ImageFont.truetype(str(path), size)


def card():
    image = Image.new("RGB", (1200, 630), PAPER)
    draw = ImageDraw.Draw(image)
    draw.rectangle((28, 28, 1171, 601), outline=INK, width=2)
    draw.text((72, 68), "PUBLIC PETITION", font=font(MED, 22), fill=INK)
    draw.text((72, 150), "EVERY FRIDAY", font=font(SEMI, 28), fill=MUTED)
    draw.text((64, 175), "4:45", font=font(BOLD, 210), fill=STAMP)
    draw.text((620, 300), "pm", font=font(SEMI, 48), fill=INK)
    draw.text((72, 430), "New York time", font=font(SEMI, 28), fill=INK)
    draw.line((72, 480, 1128, 480), fill=INK, width=2)
    draw.text((72, 500), "Grok Bot weekly usage should reset", font=font(MED, 32), fill=INK)
    draw.text((72, 546), "every Friday at 4:45pm New York time.", font=font(MED, 32), fill=INK)
    image.save(PUBLIC / "og.jpg", "JPEG", quality=92, optimize=True)
    image.save(PUBLIC / "og.png", "PNG", optimize=True)


def apple():
    image = Image.new("RGB", (180, 180), PAPER)
    draw = ImageDraw.Draw(image)
    draw.rectangle((8, 8, 171, 171), outline=INK, width=3)
    draw.text((90, 78), "4:45", font=font(BOLD, 42), fill=STAMP, anchor="mm")
    draw.text((90, 118), "FRI", font=font(SEMI, 18), fill=INK, anchor="mm")
    image.save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)


if __name__ == "__main__":
    card()
    apple()
    print("wrote og.jpg og.png apple-touch-icon.png")
