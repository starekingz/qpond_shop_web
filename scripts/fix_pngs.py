import os
import sys
from PIL import Image
from pathlib import Path

SRC = r"c:\Users\ted97\Desktop\模組開發\文靜資源包\assets"
DST = r"c:\Users\ted97\Desktop\模組開發\倉儲網頁\public\textures\assets"

fixed = 0
failed = 0

for root, dirs, files in os.walk(SRC):
    for fname in files:
        if not fname.lower().endswith(".png"):
            continue
        src_path = os.path.join(root, fname)
        # Compute relative path from SRC/<ns>/
        rel = os.path.relpath(src_path, SRC)
        dst_path = os.path.join(DST, rel)
        dst_dir = os.path.dirname(dst_path)
        
        try:
            img = Image.open(src_path)
            img.load()  # Force full decode
            os.makedirs(dst_dir, exist_ok=True)
            img.save(dst_path, "PNG")
            fixed += 1
            if "yellow" in fname or "necklace" in fname:
                print(f"FIXED: {rel} ({img.size[0]}x{img.size[1]})")
        except Exception as e:
            failed += 1
            if failed <= 10:
                print(f"FAIL: {rel}: {e}")

print(f"\nDone: fixed={fixed}, failed={failed}")

# Verify
test = os.path.join(DST, "qp_item", "textures", "equipment", "necklace", "yellow.png")
if os.path.exists(test):
    img = Image.open(test)
    img.load()
    print(f"Verify yellow.png: {img.size[0]}x{img.size[1]} {img.mode} - OK")
