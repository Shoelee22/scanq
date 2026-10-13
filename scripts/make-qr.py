#!/usr/bin/env python3
"""Generate a print-ready QR code for the stationery queue.

Usage:
    pip install "qrcode[pil]"
    python scripts/make-qr.py https://your-stationery-queue.vercel.app
    python scripts/make-qr.py https://your-url --out qr/counter-qr.png --size 1600

Print the PNG, laminate it, stick it at the counter.
"""
import argparse
import sys

import qrcode


def main() -> None:
    ap = argparse.ArgumentParser(description="Print-ready QR for the stationery queue")
    ap.add_argument("url", help="Deployed URL of the customer page (index.html)")
    ap.add_argument("--out", default="qr/counter-qr.png", help="Output PNG path")
    ap.add_argument("--size", type=int, default=1200, help="Output size in px (square)")
    args = ap.parse_args()

    qr = qrcode.QRCode(
        version=None,  # auto-size to fit the URL
        error_correction=qrcode.constants.ERROR_CORRECT_M,  # survives lamination glare
        box_size=10,
        border=4,
    )
    qr.add_data(args.url.strip())
    qr.make(fit=True)
    img = qr.make_image(fill_color="#191817", back_color="white").convert("RGB")
    img = img.resize((args.size, args.size))
    img.save(args.out)
    print(f"Saved {args.out} ({args.size}x{args.size}) -> {args.url}")


if __name__ == "__main__":
    sys.exit(main())
