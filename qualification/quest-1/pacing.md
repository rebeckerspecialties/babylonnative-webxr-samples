# Quest 1, 2026-11-23: compositor layer pacing

Physical Quest 1, Vulkan, runtime `8a3cdc02`; no driver tracing, heap sampling or screenshot during these intervals. Cases ran in order, movie source 960x1080 stereo VP8. The two 72 Hz movie rows use the packaged 24 fps remux; the two 60 Hz rows use the original 30 fps source. The 2 s warmup is excluded from **both** rate and misses. Refreshes refer to application XR predicted-display-time intervals, not inferred film frames or compositor-generated frames. Uploads cover the complete run; the direct compositor Surface is separate from texture video.

| Raw case | Hz | Steady s | FPS | Misses | Longest clean s | Worst ms | Movie uploads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Video on equirect texture | 72 | 42.96 | 71.93 | 3 | 17.19 | 27.79 | 1070 |
| Media equirect | 72 | 42.99 | 71.95 | 2 | 20.04 | 27.78 | 0 |
| Video on equirect texture | 60 | 43.00 | 59.98 | 1 | 28.82 | 33.33 | 1344 |
| Media equirect | 60 | 42.98 | 60.00 | 0 | 42.98 | 16.90 | 0 |
| Media cylinder | 60 | 18.00 | 60.00 | 0 | 18.00 | 16.89 | 0 |
| Media quad | 60 | 18.00 | 60.00 | 0 | 18.00 | 16.77 | 0 |
| Quad + cylinder | 72 | 18.00 | 71.94 | 1 | 13.64 | 27.81 | 0 |
| Destroy quad | 72 | 18.00 | 72.00 | 0 | 18.00 | 13.95 | 0 |
| Quad image | 72 | 18.01 | 72.00 | 0 | 18.01 | 13.92 | 0 |
| Cylinder image | 72 | 18.00 | 71.94 | 1 | 15.97 | 27.76 | 0 |
| Equirect image | 72 | 18.01 | 72.00 | 0 | 18.01 | 13.92 | 0 |
| Cube faces | 72 | 18.00 | 71.94 | 1 | 16.07 | 27.78 | 0 |
| Quad image (stereo) | 72 | 18.01 | 71.94 | 1 | 9.76 | 27.77 | 0 |
| Cylinder image (stereo) | 72 | 18.00 | 72.00 | 0 | 18.00 | 14.01 | 0 |
| Equirect image (stereo) | 72 | 18.01 | 72.00 | 0 | 18.01 | 13.95 | 0 |
| Cube image (stereo) | 72 | 18.00 | 72.00 | 0 | 18.00 | 13.93 | 0 |
| Quad + cylinder | 72 | 18.01 | 72.00 | 0 | 18.01 | 13.94 | 0 |

The two quad+cylinder attempts illustrate run variance. All eight individual stills averaged above 71 FPS; the stereo quad missed one refresh in the middle and did **not** establish 15 uninterrupted seconds on this attempt. A real-trigger selection case was not part of the cadence gate. See [AGENTS.md](../../AGENTS.md) for separate raw timing, stereo pixels and interactive controller/HUD runs.

## Interactive foreground control

Same physical headset, active Babylon scene, pointer and FPS HUD, no screenshot, no pose logger, one passive application log reader. Two recorder-off and two recorder-on runs in ABBA order, then a separate run removing only the unused near-touch feature. The recorder did not give a repeatable pacing improvement. Removing near-touch also removed an offline touch-material snippet request; far pointer selection remains enabled. The texture conversion/upload path is still below target with real foreground content.

| Near-touch | Recorder | Layer | Steady FPS | Misses | Longest clean s |
| --- | --- | --- | ---: | ---: | ---: |
| on | false | Quad image | 71.62 | 7 | 3.53 |
| on | false | Video on equirect texture | 59.17 | 15 | 6.95 |
| on | false | Media equirect | 59.83 | 3 | 10.05 |
| on | true | Quad image | 71.61 | 7 | 9.71 |
| on | true | Video on equirect texture | 59.00 | 18 | 5.10 |
| on | true | Media equirect | 59.78 | 4 | 15.67 |
| on | true | Quad image | 71.83 | 3 | 10.35 |
| on | true | Video on equirect texture | 59.44 | 10 | 5.05 |
| on | true | Media equirect | 59.83 | 3 | 8.97 |
| on | false | Quad image | 71.89 | 2 | 14.01 |
| on | false | Video on equirect texture | 59.67 | 6 | 7.93 |
| on | false | Media equirect | 60.00 | 0 | 17.98 |
| off | true | Quad image | 71.94 | 1 | 12.76 |
| off | true | Video on equirect texture | 59.05 | 17 | 8.75 |
| off | true | Media equirect | 59.72 | 5 | 7.50 |

Final local qualification APK SHA-256: `40615eabdfefbb08f2e5dc6f1f877a180e4726d0c06d1da21efd86bee312bf32` (local debug signature). Stereo projection cases 25-28, cube 118, film markers 105/106 and foreground controls 107/108 passed on that APK. Both original cube atlases also matched every packaged texel independently (six and twelve faces).
