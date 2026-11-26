"""Compare every packaged cube texel to the upstream canvas flip, independent of Java ImageIO."""
import sys
from pathlib import Path
import cv2
import numpy as np

src, packaged = (cv2.imread(str(Path(name)), cv2.IMREAD_UNCHANGED) for name in sys.argv[1:])
if src is None or packaged is None or src.shape != packaged.shape or src.shape[1] not in (6*src.shape[0], 12*src.shape[0]):
    sys.exit("Missing or invalid mono/stereo cube atlas")
w = src.shape[0]
faces = src.shape[1] // w
for face in range(faces):
    expected = src[:,(faces-1-face)*w:(faces-face)*w][:,::-1]
    if not np.array_equal(packaged[:,face*w:(face+1)*w], expected):
        sys.exit(f"Wrong face pixels or orientation at WebGPU slice {face}")
print(f"All {faces} cube faces match the upstream source, including every edge texel")
