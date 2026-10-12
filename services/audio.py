from pathlib import Path
import subprocess

def validate_audio(path: Path) -> Path:
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"Archivo de música inexistente: {path}")
    result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    if result.returncode or result.stdout.strip() != "audio":
        raise ValueError(f"El archivo no contiene audio válido: {path}")
    return path
