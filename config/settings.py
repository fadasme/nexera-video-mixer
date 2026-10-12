from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MEDIA_DIR = ROOT / "media"
OUTPUT_DIR = ROOT / "output"
LOG_DIR = ROOT / "logs"
SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}
TARGET_WIDTH, TARGET_HEIGHT, TARGET_FPS = 1920, 1080, 30

for directory in (DATA_DIR, DATA_DIR / "projects", MEDIA_DIR / "source", MEDIA_DIR / "clips", MEDIA_DIR / "music", OUTPUT_DIR, LOG_DIR):
    directory.mkdir(parents=True, exist_ok=True)
