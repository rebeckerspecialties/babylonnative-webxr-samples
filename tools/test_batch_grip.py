import json
from pathlib import Path
import struct
import tempfile
import unittest

from tools.batch_grip import batch_grip


def triangles(path):
    model = json.loads(path.read_bytes())
    data = (path.parent / model["buffers"][0]["uri"]).read_bytes()

    def values(index):
        a = model["accessors"][index]
        view = model["bufferViews"][a["bufferView"]]
        dim = {"VEC2": 2, "VEC3": 3, "SCALAR": 1}[a["type"]]
        fmt = "<" + str(dim) + {5121: "B", 5123: "H", 5126: "f"}[a["componentType"]]
        start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        return list(struct.iter_unpack(fmt, data[start:start + a["count"] * struct.calcsize(fmt)]))

    corners = []
    for p in model["meshes"][0]["primitives"]:
        attrs = {key: values(i) for key, i in p["attributes"].items()}
        pbr = model["materials"][p["material"]]["pbrMetallicRoughness"]
        color = tuple(pbr.get("baseColorFactor", [1, 1, 1, 1])[:3])
        for (i,) in values(p["indices"]):
            vertex_color = attrs["COLOR_0"][i] if "COLOR_0" in attrs else (1, 1, 1)
            corners.append((attrs["POSITION"][i], attrs["NORMAL"][i], attrs["TEXCOORD_0"][i],
                            struct.pack("<3f", *(c * v for c, v in zip(color, vertex_color))),
                            pbr.get("metallicFactor", 1), pbr.get("roughnessFactor", 1), model["materials"][p["material"]].get("doubleSided", False)))
    return corners, model


class GripTest(unittest.TestCase):
    assets = Path(__file__).resolve().parents[1] / "third_party/webxr-samples/media/gltf/controller"

    def test_preserves_every_shaded_corner_and_both_hand_transforms(self):
        with tempfile.TemporaryDirectory() as temp:
            for hand in ("controller", "controller-left"):
                source = self.assets / (hand + ".gltf")
                out = Path(temp) / source.name
                batch_grip(source, out)
                expected, original = triangles(source)
                actual, packed = triangles(out)
                self.assertEqual(len(expected), 1020)
                self.assertEqual(expected, actual)
                self.assertEqual(len(packed["meshes"][0]["primitives"]), 1)
                self.assertEqual(original["nodes"], packed["nodes"])

    def test_refuses_a_new_material_that_cannot_be_baked_into_color(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            model = json.loads((self.assets / "controller.gltf").read_bytes())
            model["materials"][0]["pbrMetallicRoughness"]["roughnessFactor"] = 0.3
            source = root / "changed.gltf"
            source.write_text(json.dumps(model))
            (root / "controller.bin").write_bytes((self.assets / "controller.bin").read_bytes())
            with self.assertRaisesRegex(ValueError, "materials"):
                batch_grip(source, root / "packed.gltf")
