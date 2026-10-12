# Nexera Video Mixer

Mixer de video local con dos decks, colas independientes, salida externa y modo de mezcla automática. La interfaz usa React/Vite y el servicio multimedia usa FastAPI; el archivo `app.py` conserva una interfaz Streamlit anterior.

## Requisitos

- Python 3.12 o superior
- Node.js y npm
- `ffmpeg` y `ffprobe` disponibles en `PATH`

## Ejecutar en el notebook

Desde la carpeta raíz del proyecto, abre dos terminales.

Terminal 1 — API:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --host 127.0.0.1 --port 8001
```

Terminal 2 — interfaz:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Abre <http://localhost:5173>. Vite reenvía `/api` a `127.0.0.1:8001`. La salida externa y Web MIDI deben abrirse desde el mismo origen local; el controlador MIDI requiere que el navegador soporte Web MIDI y que el sistema operativo detecte el dispositivo.

Para comprobar el servicio:

```bash
curl http://127.0.0.1:8001/api/health
```

## Pruebas y build

```bash
python -m pytest -q
cd frontend
npm ci
npm run build
```

## YouTube y datos locales

Las playlists se consultan con `yt-dlp`. YouTube puede limitar o bloquear descargas desde algunas IP de servidores con errores de verificación anti-bot; por eso, para operar desde un notebook, conviene ejecutar el API también en el notebook. No se deben subir cookies de navegador ni sesiones de YouTube al repositorio.

El directorio `media/` contiene descargas/cargas locales y `output/` contiene renders. Ambos se excluyen de Git junto con `data/projects/`, entornos virtuales, dependencias y el build local. Los archivos de medios no se sincronizan entre el notebook y el VPS.

## Endpoints principales

- `GET /api/health`
- `POST /api/youtube/playlist`
- `POST /api/decks/{video_id}` y `GET /api/decks/{video_id}`
- `POST /api/renders`

## Despliegue

El frontend se compila con `npm run build`; `server.py` sirve `frontend/dist` y monta la API FastAPI bajo el mismo origen. En el VPS se puede iniciar con:

```bash
uvicorn server:app --host 127.0.0.1 --port 8093 --workers 1
```

El VPS requiere sus propias dependencias de sistema (`ffmpeg`/`ffprobe`) y un servicio de sistema con permisos de escritura para `data/`, `media/`, `output/` y `logs/`. Mantén credenciales y archivos `.env` fuera de Git. El despliegue no copia la biblioteca de medios local, y YouTube puede bloquear descargas desde la IP del VPS aunque la app esté operativa.
