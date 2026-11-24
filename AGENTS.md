# Repository notes

<!-- quest-qualification-handoff -->
## Quest runtime qualification

Samples 6/10/36 qualify atlas orientation and actual movie content; 105/106 distinguish eye identity after composition.

Start with the [shared Quest handoff](https://github.com/rebeckerspecialties/BabylonNative/blob/wgpu/Documentation/QuestRuntimeHandoff.md) for verified artifact pins, the camera ownership audit, and links to related PRs. Use normal logging, confirm both eyes on the physical display, and verify Home passthrough before and after a single test. Do not use compositor submission count as visual evidence or trigger hosted simulator screenshots for this handoff.

- Implementation: Keep hosted APK asset checks, independent FFmpeg oracle and swapped-eye controls; investigate the Home passthrough relapse independently of successful layer output.
- Device: Install the clean artifact; verify cube floor/ceiling, movie and eye markers, normal exit and Home passthrough before the next case.
