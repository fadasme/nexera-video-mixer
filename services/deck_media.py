"""Prepare browser-compatible video; cache is local and persists across restarts."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
import logging
import json
import subprocess
import yt_dlp
from config.settings import MEDIA_DIR

CACHE = MEDIA_DIR / 'deck_video'
pool = ThreadPoolExecutor(max_workers=2)
states = {}
lock = Lock()

def prepare(video_id):
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix='deck-') as temp:
            def update_download_progress(progress):
                if progress.get('status') != 'downloading':
                    return
                downloaded = int(progress.get('downloaded_bytes') or 0)
                total = int(progress.get('total_bytes') or progress.get('total_bytes_estimate') or 0)
                megabytes = 1024 * 1024
                if total:
                    percent = downloaded / total * 100
                    message = f"Descargando video {percent:.0f}% ({downloaded / megabytes:.0f}/{total / megabytes:.0f} MB)"
                else:
                    message = f"Descargando video ({downloaded / megabytes:.0f} MB)"
                eta = progress.get('eta')
                if eta is not None:
                    minutes, seconds = divmod(max(0, int(eta)), 60)
                    message += f" · faltan {minutes}:{seconds:02d}"
                with lock:
                    states[video_id] = {'status': 'downloading', 'message': message}

            with yt_dlp.YoutubeDL({'quiet': True, 'noplaylist': True,
                # A deck preview does not need 720p. Prefer a single muxed MP4 at <=360p
                # so hour-long DJ mixes do not consume hundreds of megabytes unnecessarily.
                # Prefer <=360p, including YouTube's separate video+audio streams. Some
                # long mixes have no progressive MP4, so retain broad fallbacks.
                'format': 'bestvideo[height<=360]+bestaudio/best[height<=360]/bestvideo+bestaudio/best',
                'merge_output_format': 'mp4', 'socket_timeout': 30, 'retries': 2,
                'progress_hooks': [update_download_progress],
                'outtmpl': str(Path(temp)/'source.%(ext)s')}) as ydl:
                info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=True)
                source = ydl.prepare_filename(info)
                merged = Path(temp)/'source.mp4'
                if merged.is_file(): source = str(merged)
            with lock:
                states[video_id] = {'status': 'preparing', 'message': 'Preparando video…'}
            probe = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,codec_name',
                '-of','json',source], capture_output=True, text=True, timeout=60)
            if probe.returncode:
                raise RuntimeError('No se pudo analizar el video descargado')
            metadata = json.loads(probe.stdout)
            codecs = {stream.get('codec_type'):stream.get('codec_name') for stream in metadata.get('streams', [])}
            duration = float(metadata.get('format', {}).get('duration') or 0)
            output = str(Path(temp)/'ready.mp4')
            common = ['ffmpeg','-y','-i',source,'-map','0:v:0','-map','0:a:0?']
            if codecs.get('video') == 'h264' and codecs.get('audio') in (None, 'aac'):
                # Avoid re-encoding hour-long sources when their codecs already work in browsers.
                command = common + ['-c','copy','-movflags','+faststart',output]
            else:
                command = common + ['-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac',
                    '-b:a','192k','-movflags','+faststart',output]
            # A fixed 10-minute timeout incorrectly killed long-form videos while converting.
            timeout = max(1800, int(duration * 3 + 600))
            result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
            if result.returncode:
                raise RuntimeError('No se pudo convertir el video para el navegador')
            (Path(temp)/'ready.mp4').replace(CACHE/f'{video_id}.mp4')
        with lock:
            states[video_id] = {'status': 'ready', 'message': 'Video listo'}
    except Exception as exc:
        logging.exception('Deck audio failed: %s', video_id)
        with lock:
            states[video_id] = {'status': 'failed', 'message': str(exc)}

def request_audio(video_id):
    with lock:
        if (CACHE/f'{video_id}.mp4').is_file():
            return {'status': 'ready', 'message': 'Video listo'}
        if states.get(video_id, {}).get('status') not in ('downloading','preparing'):
            states[video_id] = {'status': 'downloading', 'message': 'Descargando video…'}
            pool.submit(prepare, video_id)
        return dict(states[video_id])
