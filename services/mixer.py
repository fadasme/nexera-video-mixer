from pathlib import Path
import subprocess

def concatenate(files: list[Path], output: Path) -> Path:
    if not files: raise ValueError("No hay clips para concatenar")
    listing = output.parent / f"concat_{output.stem}.txt"
    listing.write_text("\n".join(f"file '{p.resolve()}'" for p in files), encoding="utf-8")
    command = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(output)]
    subprocess.run(command, capture_output=True, text=True, check=True)
    listing.unlink(missing_ok=True)
    return output
