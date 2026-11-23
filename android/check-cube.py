"""Compare every packaged cube texel to the upstream canvas flip, independent of Java ImageIO."""
import sys
from pathlib import Path
import cv2
import numpy as np

src, packaged = (cv2.imread(str(Path(name)), cv2.IMREAD_UNCHANGED) for name in sys.argv[1:])
if src is None or packaged is None or src.shape != packaged.shape or src.shape[1] != 6 * src.shape[0]:
    sys.exit("Missing or invalid six-face atlas")
for face in range(6):
    w = src.shape[0]
    expected = src[:,(5-face)*w:(6-face)*w][:,::-1]
    if not np.array_equal(packaged[:,face*w:(face+1)*w], expected):
        sys.exit(f"Wrong face pixels or orientation at WebGPU slice {face}")
print("All six cube faces match the upstream source, including every edge texel")
