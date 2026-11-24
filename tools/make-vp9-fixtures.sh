#!/bin/sh
# Synthetic eye identifiers. The white stripe toggles once per second.
# Regeneration uses FFmpeg 8+ with a high-bit-depth libvpx encoder.
set -eu
out=$(dirname "$0")/../qualification/films
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -f "$tmp/pq.webm"; rmdir "$tmp"' EXIT
for profile in 0 2; do
    fps=30
    pix=yuv420p
    set --
    if [ "$profile" = 2 ]; then
        fps=24
        pix=yuv420p10le
        set -- -mastering_display 'G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(10000000,1)' -content_light '1000,400'
    fi
    destination="$out/vp9-p$profile.webm"
    [ "$profile" != 2 ] || destination="$tmp/pq.webm"
    ffmpeg -nostdin -y -loglevel error -f lavfi "$@" -i "color=red:s=640x360:r=$fps" -t 32 -an \
        -vf "drawbox=x=0:y=180:w=640:h=180:color=blue:t=fill,drawbox=x=48:y=0:w=32:h=360:color=white:t=fill:enable='lt(mod(t,2),1)',format=$pix" \
        -c:v libvpx-vp9 -profile:v "$profile" -pix_fmt "$pix" -g "$fps" -b:v 300k "$destination"
done
ffmpeg -nostdin -y -loglevel error -i "$tmp/pq.webm" -c copy -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc "$out/vp9-p2.webm"
ffmpeg -nostdin -y -loglevel error -itsscale 1.25 -i "$out/vp9-p0.webm" -c copy -r 24 "$out/vp9-p0-24.webm"
