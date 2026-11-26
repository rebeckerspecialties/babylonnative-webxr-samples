"""Check a Quest compositor capture, not an XR texture readback (cases 107/108)."""
import argparse
import cv2
import numpy as np


def inspect(frame, opaque):
    if frame is None or frame.shape[1] % 2 or frame.shape[1] <= frame.shape[0]:
        raise ValueError("Expected an unmodified two-eye Quest display capture")
    results = []
    for index, eye in enumerate(np.hsplit(frame, 2)):
        h, w = eye.shape[:2]
        roi = eye[h//4:3*h//4, w//4:3*w//4]
        # The test draws a red opaque marker in the left projection and blue in
        # the right. Neither the photographic panorama nor a duplicated eye passes.
        b,g,r = cv2.split(roi)
        signal, other = (r,b) if index == 0 else (b,r)
        marker = (signal > 160) & (g < 60) & (other < 60)
        count, _, stats, _ = cv2.connectedComponentsWithStats(marker.astype(np.uint8))
        largest = max(stats[1:,cv2.CC_STAT_AREA], default=0)
        if not .008 < largest / marker.size < .4:
            raise ValueError(f"Missing or misrouted foreground marker in eye {index}: {largest}/{marker.size}")
        brightness = np.max(roi, axis=2)
        lit = np.mean(brightness[~marker] > 30)
        if (opaque and lit > .03) or (not opaque and lit < .25):
            raise ValueError(f"Incorrect panorama visibility in eye {index}: lit={lit:.4f}, opaque={opaque}")
        results.append((round(largest/marker.size,3), round(float(lit),3)))
    return results


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode", choices=["transparent","opaque"])
    p.add_argument("capture")
    a = p.parse_args()
    print(inspect(cv2.imread(a.capture), a.mode == "opaque"))
