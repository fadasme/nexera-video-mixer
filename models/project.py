from dataclasses import asdict, dataclass, field
import json
from pathlib import Path
from uuid import uuid4

@dataclass
class Project:
    name: str
    duration: float = 60.0
    format: str = "16:9"
    resolution: str = "1920x1080"
    clip_min_duration: float = 5.0
    clip_max_duration: float = 10.0
    keep_original_audio: bool = True
    id: str = field(default_factory=lambda: str(uuid4()))
    source_videos: list = field(default_factory=list)
    status: str = "created"

    def save(self, directory: Path) -> Path:
        path = directory / f"{self.id}.json"
        path.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")
        return path
