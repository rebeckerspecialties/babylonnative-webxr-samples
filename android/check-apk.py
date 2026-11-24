"""Fail packaging if a fixture needs a missing file or remote content."""
import json
from pathlib import PurePosixPath
import sys
from urllib.parse import unquote
from zipfile import ZIP_STORED, ZipFile


with ZipFile(sys.argv[1]) as apk:
    base = PurePosixPath("assets/Scripts")
    fixed = ["launcher.js", "main.js", "babylon_lite_bootstrap.js", "menu-entry.js",
             "layer-images/rect-mono.png", "layer-images/mono_equirect_test.png",
             "layer-images/mono_cube_map.png", "layer-images/stereo_cube_map.png",
             "layer-images/rect-stereo-top-down.png", "layer-images/chess-pano-4k.png",
             "layer-images/ATTRIBUTION.md", "controller/ATTRIBUTION.md"]
    for name in fixed:
        if not apk.getinfo(str(base / name)).file_size:
            raise ValueError(f"Empty asset: {name}")
    for name in ["controller/controller.gltf", "controller/controller-left.gltf",
                 "spatial/reticle/reticle.gltf", "spatial/sunflower/sunflower.gltf", "spatial/cube-room/cube-room.gltf"]:
        path = base / name
        model = json.loads(apk.read(str(path)))
        for item in model.get("buffers", []) + model.get("images", []):
            uri = item.get("uri", "")
            if uri and not uri.startswith("data:"):
                apk.getinfo(str(path.parent / unquote(uri)))
    for asset in ["bbb-sunflower-540p2-1min.webm", "bbb-stereo-24fps.webm",
                  "vp9-p0.webm", "vp9-p0-24.webm", "vp9-p2.webm"]:
        video = apk.getinfo(str(base / "layer-images" / asset))
        if video.compress_type != ZIP_STORED or video.file_size == 0:
            raise ValueError(f"MediaPlayer requires a nonempty, uncompressed video asset: {asset}")
    # This fork statically links OpenXR::openxr_loader into the embedding.
    embedding = apk.read("lib/arm64-v8a/libBabylonNativeEmbedding.so")
    if not embedding.startswith(b"\x7fELF") or b"xrInitializeLoaderKHR" not in embedding:
        raise ValueError("Missing Android OpenXR loader in arm64 embedding")
