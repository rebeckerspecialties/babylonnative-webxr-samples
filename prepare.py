"""Generate browser and native entries from a pinned, unmodified upstream WebGPU example."""
import argparse
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from shutil import copyfile, copytree, ignore_patterns
import subprocess


class Module(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active = False
        self.modules = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("type") == "module" and "src" not in attrs:
            self.active = True
            self.modules.append("")

    def handle_endtag(self, tag):
        if tag == "script":
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.modules[-1] += data


def generate(checkout, output):
    html = (checkout / "webgpu/vr-barebones.html").read_bytes()
    if sha256(html).hexdigest() != "f0fc822cc561d31ddd245c22ee53065efd1cac712bb853aab2cfeae410966944":
        raise ValueError("Unexpected source. Use immersive-web/webxr-samples at 6d548461574f733e2d0578deb32b6f0387735dab.")
    page = html.decode()
    parser = Module()
    parser.feed(page)
    module, = parser.modules
    start = "      initXR();"
    if module.count(start) != 1:
        raise ValueError("Unexpected upstream entry point")
    body, end = module.split(start)
    checks = (Path(__file__).with_name("projectionReplacement.js").read_text() + "\n" +
              Path(__file__).with_name("trackedInput.js").read_text() + "\n" +
              Path(__file__).with_name("checks.js").read_text())
    notice = page.split("<!--", 1)[1].split("-->", 1)[0]
    pages = output / "webgpu"
    pages.mkdir(parents=True, exist_ok=True)
    for asset in ("css/common.css", "favicon-32x32.png", "favicon-96x96.png"):
        (output / asset).parent.mkdir(parents=True, exist_ok=True)
        copyfile(checkout / asset, output / asset)
    (output / "controller").mkdir(exist_ok=True)
    (output / "layer-images").mkdir(exist_ok=True)
    for name in ("sunflower","reticle","cube-room"):
        copytree(checkout / "media/gltf" / name, output / "spatial" / name, dirs_exist_ok=True, ignore=ignore_patterns("*.blend"))
    for image in ("rect-mono.png","mono_equirect_test.png"):
        copyfile(checkout / "media/textures" / image, output / "layer-images" / image)
    subprocess.run(["java", Path(__file__).parent / "tools/PrepareCube.java",
                    checkout / "media/textures/mono_cube_map.png", output / "layer-images/mono_cube_map.png"], check=True)
    for asset in ("bbb-sunflower-540p2-1min.webm","ATTRIBUTION.md"):
        copyfile(checkout / "media/video" / asset, output / "layer-images" / asset)
    for asset in ("controller.gltf", "controller-left.gltf", "controller.bin", "ATTRIBUTION.md"):
        copyfile(checkout / "media/gltf/controller" / asset, output / "controller" / asset)
    (pages / "vr-barebones.html").write_bytes(html)
    browser_menu = """
const params = new URL(location.href).searchParams;
if (params.get("launcher") === "1") {
    globalThis.webxrGuidedInput = true;
    const index = ["0", "1", "2"].indexOf(params.get("page"));
    globalThis.webxrSampleAlignOrigin = index === 1;
    globalThis.webxrSampleReplaceProjection = index === 2;
    const begin = onSessionStarted;
    onSessionStarted = async session => {
        session.addEventListener("select", () => session.end(), { once: true });
        await begin(session);
    };
    onSessionEnded = () => location.assign("../launcher.html?page=" + (Math.max(0, index) + 1));
}
"""
    (pages / "checks.html").write_text(page.replace(module, body + checks + browser_menu + "\ninitXR();\n" + end))
    flat = Path(__file__).with_name("flatControl.js").read_text()
    (pages / "flat-control.html").write_text(page.replace(module, body + flat + end))
    # Only the host/entry differs. In the browser the original button supplies user activation.
    # Native receives its canvas from the host document, not HTML named-element bindings.
    native = ("/*" + notice + "*/\nglobalThis.runWebXRSample = async (onReturn) => {\n"
              "const webgpu_canvas = document.getElementById('webgpu_canvas');\n"
              + body + checks + "\nif (onReturn) { const begin = onSessionStarted;\n"
              "onSessionStarted = async session => { await begin(session);\n"
              "session.addEventListener('select', () => session.end(), { once: true }); };\n"
              "onSessionEnded = () => { gpuUniformBuffer.destroy(); gpuDepthTexture.destroy(); "
              "gpuContext?.unconfigure?.(); gpuDevice.destroy(); onReturn(); }; }\nawait initXR();\n"
              "if (xrButton.disabled) throw Error(xrButton.textContent);\n"
              "await onButtonClicked();\n};\nif (!globalThis.webxrSampleMenu) "
              "runWebXRSample().catch(e => console.error('XR sample FAIL', e.stack || e));\n")
    (output / "main.js").write_text(native)
    (output / "offset.js").write_text("globalThis.webxrSampleAlignOrigin = true;\n")
    (output / "menu-entry.js").write_text("globalThis.webxrSampleMenu = true; globalThis.webxrGuidedInput = true;\n")
    (output / "menu-check.js").write_text("globalThis.webxrCheckMenuHandoff = true;\n")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("checkout", type=Path)
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    generate(args.checkout, args.output)
