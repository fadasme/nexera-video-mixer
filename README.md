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

Las playlists públicas pueden consultarse sin iniciar sesión. Para evitar depender de la extracción HTML de `yt-dlp`, configura `YOUTUBE_API_KEY` con una clave restringida a YouTube Data API v3; Nexera entonces usa la API oficial para leer y paginar la playlist, sin OAuth ni cookies. Si no se configura la clave, se mantiene el lector `yt-dlp` como alternativa. Las playlists privadas requieren OAuth y no se incluyen en este flujo. La lectura de la playlist no garantiza poder descargar los videos: YouTube puede bloquear `yt-dlp` desde ciertas IP de servidores con verificaciones anti-bot.

Guarda `YOUTUBE_API_KEY` como variable de entorno del proceso. No compartas claves ni cookies en GitHub. Restringe la clave a YouTube Data API v3 y, cuando sea posible, a la IP del servidor.

El directorio `media/` contiene descargas/cargas locales y `output/` contiene renders. Ambos se excluyen de Git junto con `data/projects/`, entornos virtuales, dependencias y el build local. Los archivos de medios no se sincronizan entre el notebook y el VPS.

## Inicio de sesión y roles

Todo el uso del mixer requiere una sesión de Nexera; `/api/health` permanece público para supervisión. El rol **Administrador** puede crear cuentas **Usuario** desde el botón “Administrar usuarios”. Los dos roles pueden usar el mixer y cargar playlists públicas; no hay inicio de sesión ni conexión de cuentas de YouTube.

No hay credenciales predeterminadas. Para crear el primer administrador, ejecuta el CLI de forma interactiva como el mismo usuario del sistema que ejecuta el servicio (la contraseña se solicita sin eco):

```bash
sudo -u nexera-mixer /opt/nexera-video-mixer/.venv/bin/python -m services.auth_cli
```

Después inicia sesión como administrador y crea la cuenta de usuario desde la app. Las contraseñas se almacenan con scrypt, las sesiones son revocables y vencen a las 12 horas; el archivo SQLite de autenticación queda excluido de Git. Mantén `NEXERA_COOKIE_SECURE` activado en producción con HTTPS. Para desarrollo HTTP local puedes definir `NEXERA_COOKIE_SECURE=false` antes de iniciar Uvicorn.

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
