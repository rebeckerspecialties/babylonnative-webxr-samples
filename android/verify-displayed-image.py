"""Check a Quest stereo display capture against the original compositor-layer photograph."""
import argparse
from pathlib import Path

import cv2
import numpy as np


def matches_in_each_eye(photo, capture):
    if photo is None or capture is None or capture.shape[1] % 2:
        raise ValueError("Expected the source image and a side-by-side Quest display capture")
    # Local features survive the compositor's pose, curvature and lens distortion.
    # A count alone admits repeated text: require geometrically consistent matches
    # spread across the photograph, separately in both halves of the display.
    sift = cv2.SIFT_create(nfeatures=2500)
    source, descriptors = sift.detectAndCompute(photo, None)
    if descriptors is None:
        raise ValueError("Reference photograph has no features")
    results = []
    for side, eye in zip(("left", "right"), np.hsplit(capture, 2)):
        points, eye_descriptors = sift.detectAndCompute(eye, None)
        pairs = [] if eye_descriptors is None or len(points) < 2 else [
            a for a, b in cv2.BFMatcher().knnMatch(descriptors, eye_descriptors, k=2)
            if a.distance < 0.72 * b.distance
        ]
        if len(pairs) < 12:
            raise ValueError(f"{side} eye: only {len(pairs)} distinctive photo matches")
        src = np.float32([source[p.queryIdx].pt for p in pairs])
        dst = np.float32([points[p.trainIdx].pt for p in pairs])
        _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if mask is None:
            raise ValueError(f"{side} eye: no consistent placement")
        inliers = src[mask.ravel() != 0]
        if len(inliers) < 12 or cv2.contourArea(cv2.convexHull(inliers)) < 0.05 * photo.size:
            raise ValueError(f"{side} eye: image matches are too few or concentrated")
        results.append(len(inliers))
    return tuple(results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] /
                        "third_party/webxr-samples/media/textures/rect-mono.png")
    args = parser.parse_args()
    print("Photo inliers (left, right):", matches_in_each_eye(
        cv2.imread(str(args.source), cv2.IMREAD_GRAYSCALE),
        cv2.imread(str(args.capture), cv2.IMREAD_GRAYSCALE)))
