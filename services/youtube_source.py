from pathlib import Path
import yt_dlp
import re
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen

def _plain_url(url: str) -> str:
    match = re.fullmatch(r"\[.*?\]\((https?://[^)]+)\)", url.strip())
    return match.group(1) if match else url.strip()

def _playlist_id(url: str) -> str:
    parsed = urlparse(_plain_url(url))
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
        "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
        "youtube-nocookie.com", "www.youtube-nocookie.com",
    }:
        raise ValueError("Usa un enlace válido de una playlist pública de YouTube")
    playlist_id = parse_qs(parsed.query).get("list", [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", playlist_id):
        raise ValueError("El enlace no contiene un identificador de playlist válido")
    return playlist_id

def _youtube_api(path: str, params: dict) -> dict:
    query = urlencode({**params, "key": os.environ["YOUTUBE_API_KEY"]})
    try:
        with urlopen(f"https://www.googleapis.com/youtube/v3/{path}?{query}", timeout=20) as response:
            return json.loads(response.read())
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read()).get("error", {}).get("message", "")
        except (ValueError, AttributeError):
            detail = ""
        if exc.code == 403:
            raise ValueError("YouTube rechazó la playlist. Verifica que sea pública y que la API key tenga habilitada YouTube Data API v3.") from exc
        raise ValueError(f"YouTube Data API respondió HTTP {exc.code}: {detail or exc.reason}") from exc
    except URLError as exc:
        raise ValueError(f"No se pudo conectar con YouTube Data API: {exc.reason}") from exc

def _api_list_playlist(url: str) -> list[dict]:
    playlist_id = _playlist_id(url)
    items = []
    page_token = None
    while True:
        params = {"part": "snippet,contentDetails", "playlistId": playlist_id, "maxResults": 50}
        if page_token:
            params["pageToken"] = page_token
        page = _youtube_api("playlistItems", params)
        for entry in page.get("items", []):
            snippet = entry.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if video_id:
                items.append({"id": video_id, "title": snippet.get("title") or video_id,
                              "url": f"https://www.youtube.com/watch?v={video_id}", "duration": None})
        page_token = page.get("nextPageToken")
        if not page_token:
            break

    # PlaylistItems does not include duration. Fetch it in batches while retaining
    # the list's original order and skipping videos unavailable to the API.
    for start in range(0, len(items), 50):
        batch = items[start:start + 50]
        details = _youtube_api("videos", {"part": "contentDetails", "id": ",".join(item["id"] for item in batch)})
        durations = {entry["id"]: entry.get("contentDetails", {}).get("duration")
                     for entry in details.get("items", [])}
        for item in batch:
            item["duration"] = _duration_seconds(durations.get(item["id"]))
    return items

def _duration_seconds(value: str | None) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if not match:
        return None
    hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return hours * 3600 + minutes * 60 + seconds

def list_playlist(url: str) -> list[dict]:
    url = _plain_url(url)
    if os.environ.get("YOUTUBE_API_KEY"):
        return _api_list_playlist(url)
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
