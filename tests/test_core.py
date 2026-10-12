import json
import subprocess
from pathlib import Path
import pytest
from services.clips import plan_clips
from services.video import probe

def make_video(path: Path, duration=2):
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=10", "-f", "lavfi", "-i", "sine=frequency=440", "-t", str(duration), "-c:v", "libx264", "-c:a", "aac", str(path)], capture_output=True, check=True)

def test_probe_and_plan(tmp_path):
    path = tmp_path / "a.mp4"; make_video(path, 6)
    info = probe(path)
    assert info["duration"] > 5 and info["has_audio"]
    clips = plan_clips([info], 12, 5, 10)
    assert sum(c.duration for c in clips) == pytest.approx(12)

def test_invalid_file(tmp_path):
    with pytest.raises(ValueError): probe(tmp_path / "missing.mp4")
