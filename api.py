from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from services.youtube_source import list_playlist
from pydantic import Field
from typing import Literal, Annotated
from fastapi.responses import FileResponse
from services.jobs import jobs, submit
from config.settings import OUTPUT_DIR
from pathlib import Path
from services.deck_media import request_audio, states, lock, CACHE
VideoId = Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{11}$')]


class RenderRequest(BaseModel):
    ids: list[Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{11}$')]] = Field(min_length=1, max_length=25)
    duration: float = Field(default=60, ge=1, le=600)
    aspect: Literal['16:9', '9:16', '1:1'] = '16:9'

app = FastAPI(title="Nexera Video Mixer API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

class PlaylistRequest(BaseModel):
    url: HttpUrl

@app.get("/api/health")
def health(): return {"status": "ok"}

@app.post('/api/decks/{video_id}')
def prepare_deck(video_id: VideoId):
    return request_audio(video_id)

@app.get('/api/decks/{video_id}')
def deck_status(video_id: VideoId):
    if (CACHE/f'{video_id}.mp4').is_file():
        return {'status': 'ready', 'message': 'Video listo'}
    with lock:
        return dict(states.get(video_id, {'status':'failed','message':'Vuelve a cargar la canción'}))

@app.get('/api/decks/{video_id}/video')
@app.get('/api/decks/{video_id}/audio')
def deck_audio(video_id: VideoId):
    path = CACHE/f'{video_id}.mp4'
    if not path.is_file():
        raise HTTPException(404, 'Audio todavía no disponible')
    return FileResponse(path, media_type='video/mp4')

@app.post('/api/renders', status_code=202)
def create_render(request: RenderRequest):
    if any(j['status'] in ('queued', 'running') for j in jobs.values()):
        raise HTTPException(409, 'Ya hay una mezcla en proceso')
    return submit(request.ids, request.duration, request.aspect)

@app.get('/api/renders/{job_id}')
def render_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, 'Trabajo no encontrado; pudo reiniciarse el servidor')
    return dict(jobs[job_id])

@app.get('/api/renders/{job_id}/video')
def render_video(job_id: str):
    job = render_status(job_id)
    if job['status'] != 'complete':
        raise HTTPException(409, 'El video aún no está listo')
    return FileResponse(OUTPUT_DIR / Path(job['file']).name, media_type='video/mp4')

@app.post("/api/youtube/playlist")
def playlist(request: PlaylistRequest):
    try: return {"items": list_playlist(str(request.url))}
    except Exception as exc: raise HTTPException(422, f"No se pudo leer la playlist: {exc}") from exc
