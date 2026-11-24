"""Bake the packed sample grip's constant linear base colors into vertex data."""
import json
import struct


def batch_grip(original, output):
    model = json.loads(original.read_bytes())
    mesh, = model["meshes"]
    source_buffer, = model["buffers"]
    source = (original.parent / source_buffer["uri"]).read_bytes()
    vertices = {name: bytearray() for name in ("POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0")}
    indices = []
    count = 0
    double_sided = None

    def read(index, kind, component, width):
        a = model["accessors"][index]
        v = model["bufferViews"][a["bufferView"]]
        if (a["type"], a["componentType"], v["buffer"]) != (kind, component, 0) or "sparse" in a or "byteStride" in v:
            raise ValueError("Unexpected grip accessor layout")
        offset = a.get("byteOffset", 0)
        size = a["count"] * width
        if offset + size > v["byteLength"]:
            raise ValueError("Short grip attribute")
        start = v.get("byteOffset", 0) + offset
        return source[start:start + size], a["count"]

    for primitive in mesh["primitives"]:
        if set(primitive) != {"indices", "attributes", "material"} or set(primitive["attributes"]) != {"POSITION", "NORMAL", "TEXCOORD_0"}:
            raise ValueError("Only the pinned static triangle grip is supported")
        material = model["materials"][primitive["material"]]
        pbr = material["pbrMetallicRoughness"]
        sides = material.get("doubleSided", False)
        if (set(material) - {"name", "pbrMetallicRoughness", "doubleSided"} or set(pbr) != {"baseColorFactor", "metallicFactor"}
                or (double_sided is not None and sides != double_sided)
                or pbr["metallicFactor"] != 0 or pbr["baseColorFactor"][3] != 1):
            raise ValueError("Grip materials must differ only in opaque base color")
        double_sided = sides
        n = None
        for key, kind, width in (("POSITION", "VEC3", 12), ("NORMAL", "VEC3", 12), ("TEXCOORD_0", "VEC2", 8)):
            values, length = read(primitive["attributes"][key], kind, 5126, width)
            if n is not None and n != length:
                raise ValueError("Inconsistent vertex attributes")
            n = length
            vertices[key].extend(values)
        vertices["COLOR_0"].extend(struct.pack("<3f", *pbr["baseColorFactor"][:3]) * n)
        local, _ = read(primitive["indices"], "SCALAR", 5121, 1)
        if max(local) >= n:
            raise ValueError("Grip index out of range")
        indices.extend(count + i for i in local)
        count += n

    data = bytearray()
    model["accessors"] = []
    model["bufferViews"] = []

    def append(raw, kind, component, count, target):
        data.extend(bytes(-len(data) % 4))
        slot = len(model["bufferViews"])
        model["bufferViews"].append(dict(buffer=0, byteOffset=len(data), byteLength=len(raw), target=target))
        model["accessors"].append(dict(bufferView=slot, componentType=component, count=count, type=kind))
        data.extend(raw)
        return slot

    attribs = {key: append(raw, "VEC2" if key == "TEXCOORD_0" else "VEC3", 5126, count, 34962) for key, raw in vertices.items()}
    axes = list(zip(*struct.iter_unpack("<3f", vertices["POSITION"])))
    model["accessors"][attribs["POSITION"]].update(min=list(map(min, axes)), max=list(map(max, axes)))
    ix = append(struct.pack(f"<{len(indices)}H", *indices), "SCALAR", 5123, len(indices), 34963)
    mesh["primitives"] = [dict(attributes=attribs, indices=ix, material=0)]
    model["materials"] = [dict(doubleSided=double_sided, pbrMetallicRoughness=dict(metallicFactor=0))]
    binary = output.with_suffix(".bin")
    model["buffers"] = [dict(byteLength=len(data), uri=binary.name)]
    binary.write_bytes(data)
    output.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
