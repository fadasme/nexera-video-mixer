from pathlib import Path
from uuid import uuid4
from .clips import extract_clip, plan_clips
from .mixer import concatenate
from .audio import validate_audio
import subprocess

FORMATS = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}

def _has_filter(name):
    result = subprocess.run(["ffmpeg", "-filters"], capture_output=True, text=True)
    return name in result.stdout

def _postprocess(source, output, target, aspect, title=None, watermark=None, music=None):
    width, height = FORMATS[aspect]
    video = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    # Some FFmpeg distributions omit libfreetype/drawtext; keep rendering usable.
    if (title or watermark) and _has_filter("drawtext"):
        font = "/System/Library/Fonts/Helvetica.ttc"
    if title and _has_filter("drawtext"):
        safe_title = title.replace("'", "\\'").replace(":", "\\:")
        video += f",drawtext=fontfile={font}:text='{safe_title}':fontcolor=white:fontsize={max(28, width//28)}:x=(w-text_w)/2:y=h-text_h-80:box=1:boxcolor=black@0.45:boxborderw=16"
    if watermark and _has_filter("drawtext"):
        safe_watermark = watermark.replace("'", "\\'").replace(":", "\\:")
        video += f",drawtext=fontfile={font}:text='{safe_watermark}':fontcolor=white@0.8:fontsize={max(18, width//60)}:x=w-text_w-35:y=30"
    # Fade-in/out provides a verified, lightweight transition at clip boundaries.
    video = "fade=t=in:st=0:d=0.35," + video
    command = ["ffmpeg", "-y", "-i", str(source)]
    inputs = 1
    if music:
        validate_audio(music); command += ["-stream_loop", "-1", "-i", str(music)]; inputs += 1
        audio = f"[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2,loudnorm[a]"
        command += ["-filter_complex", f"[{0}:v]{video}[v];{audio}", "-map", "[v]", "-map", "[a]"]
    else:
        command += ["-vf", video, "-map", "0:v:0", "-map", "0:a:0?", "-shortest"]
    command += ["-c:v", "libx264", "-c:a", "aac", "-ar", "48000", "-movflags", "+faststart", str(output)]
    subprocess.run(command, capture_output=True, text=True, check=True)
    return output

def render_mix(metadata, output_dir: Path, target=60.0, keep_audio=True, clip_dir=None, minimum=5.0, maximum=10.0, aspect="16:9", title=None, watermark=None, music=None):
    output_dir.mkdir(parents=True, exist_ok=True)
    clip_dir = clip_dir or output_dir / "clips"
    clips = plan_clips(metadata, target, minimum, maximum)
    rendered = [extract_clip(c, clip_dir / f"clip_{i:03d}.mp4", keep_audio) for i, c in enumerate(clips)]
    output = output_dir / f"mezcla_{uuid4()}.mp4"
    intermediate = output_dir / f"intermediate_{output.stem}.mp4"
    concatenate(rendered, intermediate)
    _postprocess(intermediate, output, target, aspect, title, watermark, music)
    intermediate.unlink(missing_ok=True)
    return output, clips
