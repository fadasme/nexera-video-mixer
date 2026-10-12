from pathlib import Path
import json
import shutil
import subprocess

from config.settings import SUPPORTED_EXTENSIONS

def require_tools() -> None:
    missing = [tool for tool in ("ffmpeg", "ffprobe") if shutil.which(tool) is None]
    if missing:
        raise RuntimeError(f"Herramientas no instaladas: {', '.join(missing)}")

def probe(path: Path) -> dict:
    require_tools()
    path = Path(path)
    if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Archivo de video inválido: {path}")
    command = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise ValueError(f"No se pudo leer el video: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video:
        raise ValueError(f"No contiene stream de video: {path}")
    audio = any(s.get("codec_type") == "audio" for s in streams)
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    fps_text = video.get("avg_frame_rate", "0/1")
    n, d = (int(x) for x in fps_text.split("/"))
    return {"path": str(path), "name": path.name, "duration": duration,
            "width": video.get("width"), "height": video.get("height"),
            "resolution": f"{video.get('width')}x{video.get('height')}",
            "codec": video.get("codec_name"), "fps": n / d if d else 0, "has_audio": audio}
