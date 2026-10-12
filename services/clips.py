from dataclasses import dataclass
from pathlib import Path
import subprocess
from uuid import uuid4

@dataclass
class Clip:
    source_video: str
    start_time: float
    end_time: float
    order: int
    @property
    def duration(self): return self.end_time - self.start_time

def plan_clips(metadata: list[dict], target: float, minimum=5.0, maximum=10.0) -> list[Clip]:
    if not metadata: raise ValueError("Se requiere al menos un video")
    clips, elapsed, order = [], 0.0, 0
    index = 0
    while elapsed < target:
        item = metadata[index % len(metadata)]
        available = float(item["duration"])
        if available <= 0: raise ValueError(f"Video sin duración válida: {item['name']}")
        desired = min(maximum, target - elapsed, available)
        if desired < minimum and target - elapsed > minimum and available < minimum:
            raise ValueError(f"Video demasiado corto para crear un clip: {item['name']}")
        start = min(max(0.0, available - desired), (index * 1.37) % max(available - desired, 0.001))
        clips.append(Clip(item["path"], start, min(available, start + desired), order))
        elapsed += clips[-1].duration; order += 1; index += 1
    return clips

def extract_clip(clip: Clip, destination: Path, keep_audio=True) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-y", "-ss", str(clip.start_time), "-i", clip.source_video,
               "-t", str(clip.duration), "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
               "-r", "30", "-c:v", "libx264", "-preset", "ultrafast"]
    command += ["-c:a", "aac", "-ar", "48000"] if keep_audio else ["-an"]
    command += [str(destination)]
    subprocess.run(command, capture_output=True, text=True, check=True)
    return destination
