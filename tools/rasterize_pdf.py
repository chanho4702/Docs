from __future__ import annotations

import sys
from pathlib import Path


RUNTIME = Path(r"C:\Users\DMOVE\claude-experiences\.docx_runtime")
sys.path.insert(0, str(RUNTIME))

import pymupdf  # noqa: E402


def main() -> None:
    pdf_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale_page in output_dir.glob("page-*.png"):
        stale_page.unlink()

    pdf = pymupdf.open(pdf_path)
    scale = 150 / 72
    matrix = pymupdf.Matrix(scale, scale)
    for index, page in enumerate(pdf):
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        pixmap.save(output_dir / f"page-{index + 1}.png")
    print(f"pages={len(pdf)}")


if __name__ == "__main__":
    main()
