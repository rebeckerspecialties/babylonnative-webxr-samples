"""Prove that swapped and duplicated eyes fail the post-compositor routing check."""
from pathlib import Path
import runpy
import cv2
import numpy as np

here=Path(__file__).resolve().parent
check=runpy.run_path(str(here / "check-video-display.py"))["check_eye_markers"]
folder=here.parent / "qualification/quest-1"
capture=cv2.imread(str(folder / "identified-film-max-foveation.jpg"))
check(capture)
left,right=np.hsplit(capture,2)
for wrong in (np.hstack((right,left)), np.hstack((left,left)), np.hstack((right,right)),
              cv2.imread(str(folder / "rejected-green-film.jpg"))):
    try:
        check(wrong)
    except ValueError:
        continue
    raise AssertionError("Invalid headset capture accepted")
print("Swapped, duplicated, and green display captures rejected")
