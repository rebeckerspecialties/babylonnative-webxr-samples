import { createServer } from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";

const [checkout, destination] = process.argv.slice(2);
if (!checkout || !destination || !process.env.CHROME) throw Error("Set CHROME and pass an upstream samples checkout and output directory");
const root = resolve(checkout);
const require = createRequire(import.meta.url);
const iwer = await readFile(join(dirname(require.resolve("iwer")), "../build/iwer.min.js"), "utf8");
const layers = await readFile(join(dirname(require.resolve("webxr-layers-polyfill")), "webxr-layers-polyfill.js"), "utf8");
const server = createServer(async (request, response) => {
    const path = resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".mp4":"video/mp4", ".webm":"video/webm" };
    try {
        const data = await readFile(path);
        response.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
        response.end(data);
    } catch { response.writeHead(404).end(); }
});
await mkdir(destination, {recursive:true});
await new Promise(done => server.listen(0, "127.0.0.1", done));
let browser;
const records = [];
try {
    browser = await puppeteer.launch({executablePath:process.env.CHROME, headless:true});
    const page = await browser.newPage();
    // Install the Layers polyfill last: IWER's emulated depth binding is not a composition binding.
    await page.evaluateOnNewDocument(iwer + "\n;new IWER.XRDevice(IWER.metaQuest3).installRuntime({forceInstall:true});\n" + layers + "\n;new WebXRLayersPolyfill();");
    await page.evaluateOnNewDocument(() => {
        globalThis.referenceFrames = 0;
        const original = navigator.xr.requestSession.bind(navigator.xr);
        navigator.xr.requestSession = async (mode, init) => {
            const session = await original(mode, init);
            if (mode === "immersive-vr") {
                const raf = session.requestAnimationFrame.bind(session);
                session.requestAnimationFrame = callback => raf((time, frame) => {
                    ++globalThis.referenceFrames;
                    callback(time, frame);
                });
            }
            return session;
        };
    });
    const files = (await readdir(join(root,"layers-samples"))).filter(n => n.endsWith(".html") && n !== "index.html").sort();
    for (const name of files) {
        const errors = [];
        const listener = error => errors.push(error.message);
        page.on("pageerror",listener);
        try {
            await page.goto(`http://127.0.0.1:${server.address().port}/layers-samples/${name}`, {waitUntil:"load",timeout:15000});
            const button = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find(b => /enter (?:vr|xr)|start vr/i.test(b.textContent) && !b.disabled));
            if (button.asElement()) await button.asElement().click();
            await page.waitForFunction(() => globalThis.referenceFrames >= 30, {timeout:4500}).catch(() => {});
            const frames = await page.evaluate(() => globalThis.referenceFrames);
            const file = basename(name, ".html")+".png";
            await page.screenshot({path:join(destination,file)});
            records.push({name, frames, file, errors});
            if (name === "destroy-layer.html" && frames > 0) {
                await new Promise(done => setTimeout(done, 9000));
                await page.screenshot({path:join(destination,"destroy-after.png")});
            }
        } finally { page.off("pageerror",listener); }
    }
    console.table(records.map(({name,frames,errors}) => ({name,frames,errors:errors.length})));
    await writeFile(join(destination,"capture.json"), JSON.stringify({browser:await browser.version(),renderer:"IWER WebGL Layers polyfill",records},null,2)+"\n");
} finally {
    await browser?.close();
    server.close();
}
