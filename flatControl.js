// Browser control for machines without a headset. No XR session or pose is synthesized.
try {
    await initWebGPU();
    await new Promise((resolve, reject) => requestAnimationFrame(time => {
        try {
            onFrame(time);
            const canvas = document.createElement("canvas");
            canvas.width = webgpu_canvas.width;
            canvas.height = webgpu_canvas.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(webgpu_canvas, 0, 0);
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const colors = [0, 0, 0];
            for (let i = 0; i < data.length; i += 4) {
                for (let c = 0; c < 3; ++c) {
                    if (data[i+c] > 160 && data[i+c] > 2*data[i+(c+1)%3] && data[i+c] > 2*data[i+(c+2)%3]) colors[c]++;
                }
            }
            if (colors.some(n => n < 5)) throw Error("Missing triangle primary: " + colors.join(","));
            document.body.dataset.result = "PASS: RGB triangle pixels " + colors.join(",");
            resolve();
        } catch (e) { reject(e); }
    }));
} catch (e) {
    document.body.dataset.result = "FAIL: " + e.message;
}
