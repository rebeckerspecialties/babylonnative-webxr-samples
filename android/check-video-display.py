"""Verify displayed film content; use qualification-only fiducials for unambiguous eye routing."""
import argparse
from pathlib import Path
import subprocess
import cv2
import numpy as np


def check_eye_markers(bgr):
    for eye, image in enumerate(np.hsplit(bgr,2)):
        # The display compositor color-converts the layer (nominal zero green
        # is ~54 on Quest). Identify chroma dominance, not exact storage bytes.
        b,g,r = cv2.split(image.astype(np.int16))
        masks = [(np.minimum(b,r)-g>128)&(np.abs(b-r)<48), (np.minimum(b,g)-r>128)&(np.abs(b-g)<48)]
        areas = []
        for mask in masks:
            _, _, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
            areas.append(max(stats[1:,cv2.CC_STAT_AREA], default=0))
        if areas[eye] < 100 or areas[1-eye] >= 100:
            raise ValueError(f"Missing or wrong display-eye marker: eye {eye}, areas {areas}")


def qualify(clip, capture, start, markers):
    bgr = cv2.imread(str(capture))
    if bgr is None or bgr.shape[1] % 2:
        raise ValueError("Invalid stereo display capture")
    if markers:
        check_eye_markers(bgr)
    frame=cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-ss", str(start), "-i", str(clip),
                                   "-t", "1.5", "-vf", "fps=6", "-pix_fmt", "gray", "-f", "rawvideo", "-"])
    sift = cv2.SIFT_create(nfeatures=1800)
    display = [sift.detectAndCompute(im, None) for im in np.hsplit(frame, 2)]
    scores = np.zeros((2, 2), dtype=int)
    for packed in np.frombuffer(raw, dtype=np.uint8).reshape(-1, 1080, 960):
        for source_eye, image in enumerate(np.vsplit(packed, 2)):
            keys, desc = sift.detectAndCompute(image, None)
            if desc is None:
                continue
            for target, (display_keys, display_desc) in enumerate(display):
                if display_desc is None or len(display_keys) < 2:
                    continue
                good = [a for a,b in cv2.BFMatcher().knnMatch(desc, display_desc, k=2) if a.distance < 0.70*b.distance]
                if len(good) < 12:
                    continue
                a = np.float32([keys[m.queryIdx].pt for m in good])
                b = np.float32([display_keys[m.trainIdx].pt for m in good])
                _, mask = cv2.findHomography(a, b, cv2.RANSAC, 5.0)
                if mask is not None:
                    scores[source_eye,target] = max(scores[source_eye,target], int(mask.sum()))
    print("Reference eye rows / display eye columns:", scores.tolist(), flush=True)
    for eye in range(2):
        if scores[eye,eye] < 16:
            raise ValueError(f"Display eye {eye} did not show the source film")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--start", type=float, default=12.4)
    parser.add_argument("--markers", action="store_true", help="Require magenta left and cyan right, and reject the opposite marker")
    args = parser.parse_args()
    qualify(Path(__file__).resolve().parents[1] / "third_party/webxr-samples/media/video/bbb-sunflower-540p2-1min.webm",
            args.capture, args.start, args.markers)
