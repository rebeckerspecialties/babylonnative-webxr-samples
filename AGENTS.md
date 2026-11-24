# Repository notes

<!-- quest-qualification-handoff -->
## Quest runtime qualification

Samples 6/10/36 qualify atlas orientation and actual movie content; 105/106 distinguish eye identity after composition.

Start with the [shared Quest handoff](https://github.com/rebeckerspecialties/BabylonNative/blob/wgpu/Documentation/QuestRuntimeHandoff.md) for verified artifact pins, the camera ownership audit, and links to related PRs. Use normal logging, confirm both eyes on the physical display, and verify Home passthrough before and after a single test. Do not use compositor submission count as visual evidence or trigger hosted simulator screenshots for this handoff.

- Implementation: Keep hosted APK asset checks, independent FFmpeg oracle and swapped-eye controls; investigate the Home passthrough relapse independently of successful layer output.
- Device: Install the clean artifact; verify cube floor/ceiling, movie and eye markers, normal exit and Home passthrough before the next case.
- For controller occlusion, use `python android/test-layers.py --capture OUT SERIAL 107 108` with OpenCV. Both captures must have opposite opaque foreground markers; only 107 may show the panorama. Stop other test apps first. For the actual interactive sample, `python3 android/capture-interactive-layer.py SERIAL 5 panorama.png` (10 for texture video) captures while the background and controller projection coexist, not after returning to the menu.
- FPS is application XR animation-frame cadence in both eyes, not panel refresh, decoder throughput or synthesized frames. The time window spans at least one second. Never derive FPS from the number of submitted layers or eyes.
