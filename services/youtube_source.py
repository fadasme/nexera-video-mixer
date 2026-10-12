from pathlib import Path
import yt_dlp
import re

def _plain_url(url: str) -> str:
    match = re.fullmatch(r"\[.*?\]\((https?://[^)]+)\)", url.strip())
    return match.group(1) if match else url.strip()

def list_playlist(url: str) -> list[dict]:
    url = _plain_url(url)
    options = {"quiet": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
    return [{"id": item.get("id"), "title": item.get("title") or item.get("id"),
             "url": f"https://www.youtube.com/watch?v={item.get('id')}",
             "duration": item.get("duration")} for item in info.get("entries", []) if item]

def download_videos(items: list[dict], directory: Path) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    options = {"quiet": True, "noplaylist": True, "format": "bv*+ba/b",
               "merge_output_format": "mp4", "outtmpl": str(directory / "%(id)s.%(ext)s")}
    paths = []
    with yt_dlp.YoutubeDL(options) as ydl:
        for item in items:
            video_id = item['id']
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
                raise ValueError('Identificador de YouTube inválido')
            ydl.download([f'https://www.youtube.com/watch?v={video_id}'])
            matches = [p for p in directory.glob(f'{video_id}.*')
                       if p.suffix in {'.mp4', '.webm', '.mkv', '.mov'} and '.f' not in p.stem]
            if len(matches) != 1:
                raise ValueError(f'No se obtuvo un archivo completo para {video_id}')
            paths.append(matches[0])
    return paths
