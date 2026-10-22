from fastapi import FastAPI, HTTPException, Depends, Request, Response
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
from services import auth
import os
VideoId = Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{11}$')]


class RenderRequest(BaseModel):
    ids: list[Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{11}$')]] = Field(min_length=1, max_length=25)
    duration: float = Field(default=60, ge=1, le=600)
    aspect: Literal['16:9', '9:16', '1:1'] = '16:9'

app = FastAPI(title="Nexera Video Mixer API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

class PlaylistRequest(BaseModel):
    url: HttpUrl

class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=1, max_length=256)

class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=12, max_length=256)

def authenticated_user(request: Request) -> dict:
    user = auth.user_for_session(request.cookies.get(auth.SESSION_COOKIE))
    if not user:
        raise HTTPException(401, "Inicia sesión para usar Nexera")
    return user

def administrator(user: dict = Depends(authenticated_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Esta acción requiere rol de administrador")
    return user

@app.get("/api/health")
def health(): return {"status": "ok"}

@app.post("/api/auth/login")
def login(request: Request, response: Response, credentials: LoginRequest):
    ip = request.client.host if request.client else "unknown"
    if auth.login_is_limited(ip):
        raise HTTPException(429, "Demasiados intentos. Espera 15 minutos antes de volver a probar.")
    user = auth.authenticate(credentials.username, credentials.password)
    if not user:
        auth.record_login_failure(ip)
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    auth.clear_login_failures(ip)
    token = auth.create_session(user["id"])
    response.set_cookie(auth.SESSION_COOKIE, token, max_age=auth.SESSION_TTL_SECONDS,
                        httponly=True, secure=os.environ.get("NEXERA_COOKIE_SECURE", "true").lower() not in {"0", "false", "no"},
                        samesite="lax", path="/")
    return {"user": user}

@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(auth.SESSION_COOKIE)
    auth.revoke_session(token)
    secure = os.environ.get("NEXERA_COOKIE_SECURE", "true").lower() not in {"0", "false", "no"}
    response.delete_cookie(auth.SESSION_COOKIE, path="/", httponly=True, secure=secure, samesite="lax")
    return {"status": "ok"}

@app.get("/api/auth/me")
def current_user(user: dict = Depends(authenticated_user)):
    return {"user": user}

@app.get("/api/admin/users")
def users(_: dict = Depends(administrator)):
    return {"users": auth.list_users()}

@app.post("/api/admin/users", status_code=201)
def create_user(request: CreateUserRequest, _: dict = Depends(administrator)):
    try:
        user = auth.create_user(request.username, request.password, "user")
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"user": user}

@app.post('/api/decks/{video_id}')
def prepare_deck(video_id: VideoId, _: dict = Depends(authenticated_user)):
    return request_audio(video_id)

@app.get('/api/decks/{video_id}')
def deck_status(video_id: VideoId, _: dict = Depends(authenticated_user)):
    if (CACHE/f'{video_id}.mp4').is_file():
        return {'status': 'ready', 'message': 'Video listo'}
    with lock:
        return dict(states.get(video_id, {'status':'failed','message':'Vuelve a cargar la canción'}))

@app.get('/api/decks/{video_id}/video')
@app.get('/api/decks/{video_id}/audio')
def deck_audio(video_id: VideoId, _: dict = Depends(authenticated_user)):
    path = CACHE/f'{video_id}.mp4'
    if not path.is_file():
        raise HTTPException(404, 'Audio todavía no disponible')
    return FileResponse(path, media_type='video/mp4')

@app.post('/api/renders', status_code=202)
def create_render(request: RenderRequest, _: dict = Depends(authenticated_user)):
    if any(j['status'] in ('queued', 'running') for j in jobs.values()):
        raise HTTPException(409, 'Ya hay una mezcla en proceso')
    return submit(request.ids, request.duration, request.aspect)

@app.get('/api/renders/{job_id}')
def render_status(job_id: str, _: dict = Depends(authenticated_user)):
    if job_id not in jobs:
        raise HTTPException(404, 'Trabajo no encontrado; pudo reiniciarse el servidor')
    return dict(jobs[job_id])

@app.get('/api/renders/{job_id}/video')
def render_video(job_id: str, user: dict = Depends(authenticated_user)):
    job = render_status(job_id, user)
    if job['status'] != 'complete':
        raise HTTPException(409, 'El video aún no está listo')
    return FileResponse(OUTPUT_DIR / Path(job['file']).name, media_type='video/mp4')

@app.post("/api/youtube/playlist")
def playlist(request: PlaylistRequest, _: dict = Depends(authenticated_user)):
    try: return {"items": list_playlist(str(request.url))}
    except Exception as exc: raise HTTPException(422, f"No se pudo leer la playlist: {exc}") from exc
