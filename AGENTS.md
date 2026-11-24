# Repository notes

<!-- quest-qualification-handoff -->
## Quest runtime qualification

Samples 6/10/36 qualify atlas orientation and actual movie content; 105/106 distinguish eye identity after composition.

Start with the [shared Quest handoff](https://github.com/rebeckerspecialties/BabylonNative/blob/wgpu/Documentation/QuestRuntimeHandoff.md) for verified artifact pins, the camera ownership audit, and links to related PRs. Use normal logging, confirm both eyes on the physical display, and verify Home passthrough before and after a single test. Do not use compositor submission count as visual evidence or trigger hosted simulator screenshots for this handoff.

- Implementation: Keep hosted APK asset checks, independent FFmpeg oracle and swapped-eye controls; investigate the Home passthrough relapse independently of successful layer output.
- Device: Install the clean artifact; verify cube floor/ceiling, movie and eye markers, normal exit and Home passthrough before the next case.
- For controller occlusion, use `python android/test-layers.py --capture OUT SERIAL 107 108` with OpenCV. Both captures must have opposite opaque foreground markers; only 107 may show the panorama. Stop other test apps first. For the actual interactive sample, `python3 android/capture-interactive-layer.py SERIAL 5 panorama.png` (10 for texture video) captures while the background and controller projection coexist, not after returning to the menu.
- FPS is application XR animation-frame cadence in both eyes, not panel refresh, decoder throughput or synthesized frames. The time window spans at least one second. Never derive FPS from the number of submitted layers or eyes.
- For movie correctness run `python3 android/test-layers.py SERIAL 109 110 10 109 11`. 109/110 use a packaged silent 24 fps VP8 remux at 72 Hz; 10/11 use the original 30 fps movie at 60 Hz. The texture cases compare both eyes with independent timed source pixels. Install FFmpeg before building. A plain resolved refresh-rate promise does not mean the display switched.
- For performance run `python3 android/test-layers.py SERIAL 111 112 113 114`: 45 seconds each, 24 texture/direct then 30 texture/direct. No qualification readbacks during timing. Compare app FPS, missed predicted refreshes after two seconds, worst frame interval, uploads, and the app PID's VrApi stale and GPU reports. Keep the interactive controller/HUD render as a separate control. Direct media requires zero app pixel uploads; a borrowed decoder buffer still needs conversion and a wgpu upload on the texture path.

Quest 1, 2026-11-23, one 45 s interval per case, no timing probes:

| Film / display | Path | App FPS | Uploads | Steady missed refreshes | Worst steady interval |
| --- | --- | ---: | ---: | ---: | ---: |
| 24 / 72 | texture | 71.09 | 1073 | 21 | 55.6 ms |
| 24 / 72 | direct surface | 71.47 | 0 | 21 | 83.3 ms |
| 30 / 60 | texture | 59.33 | 1342 | 11 | 66.7 ms |
| 30 / 60 | direct surface | 59.44 | 0 | 21 | 66.7 ms |

These are raw projection + movie cases, not interactive menu performance. The
separate 16 s texture movie with Babylon foreground/HUD and a display capture
measured 56.50 at 60 Hz. Zero-app-upload direct media still missed intervals.
In the retained steady VrApi seconds, median app GPU time was 2.02/1.19 ms
(texture/direct at 72 Hz) and 2.30/1.09 ms (60 Hz). These are compositor
reports, not shader counters. A separate no-movie menu control on the same
headset showed 14 minor V8 collections of 24-39 ms over the sampled steady
interval (median separation 5.5 s). Do not infer that every missed display
was GC or that changing the GC interval fixes the source of allocations.

For a GPU-only texture copy, the physical Adreno 540 reports Android hardware
buffer import, sampler YCbCr conversion (feature bit 1), foreign queue family,
and external semaphore FD support via `adb shell cmd gpu vkjson`. Still needed:
verify the actual decoder buffer's import format and acquire/release fences,
GPU-convert to the requested WebGPU destination, and hold the decoded frame
until its last GPU use. Keep the CPU-readable fallback and both-eye oracle.
