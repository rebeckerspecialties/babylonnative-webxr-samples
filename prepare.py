"""Generate browser and native entries from a pinned, unmodified upstream WebGPU example."""
import argparse
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from shutil import copyfile


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
    checks = Path(__file__).with_name("checks.js").read_text()
    notice = page.split("<!--", 1)[1].split("-->", 1)[0]
    pages = output / "webgpu"
    pages.mkdir(parents=True, exist_ok=True)
    for asset in ("css/common.css", "favicon-32x32.png", "favicon-96x96.png"):
        (output / asset).parent.mkdir(parents=True, exist_ok=True)
        copyfile(checkout / asset, output / asset)
    (pages / "vr-barebones.html").write_bytes(html)
    (pages / "checks.html").write_text(page.replace(module, body + checks + "\ninitXR();\n" + end))
    flat = Path(__file__).with_name("flatControl.js").read_text()
    (pages / "flat-control.html").write_text(page.replace(module, body + flat + end))
    # Only the host/entry differs. In the browser the original button supplies user activation.
    # Native receives its canvas from the host document, not HTML named-element bindings.
    native = ("/*" + notice + "*/\nglobalThis.runWebXRSample = async () => {\n"
              "const webgpu_canvas = document.getElementById('webgpu_canvas');\n"
              + body + checks + "\nawait initXR();\n"
              "if (xrButton.disabled) throw Error(xrButton.textContent);\n"
              "await onButtonClicked();\n};\nif (!globalThis.webxrSampleMenu) "
              "runWebXRSample().catch(e => console.error('XR sample FAIL', e.stack || e));\n")
    (output / "main.js").write_text(native)
    (output / "offset.js").write_text("globalThis.webxrSampleAlignOrigin = true;\n")
    (output / "menu-entry.js").write_text("globalThis.webxrSampleMenu = true;\n")
    (output / "menu-check.js").write_text("globalThis.webxrCheckMenuHandoff = true;\n")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("checkout", type=Path)
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    generate(args.checkout, args.output)
