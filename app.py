import tempfile
from pathlib import Path
import streamlit as st
from config.settings import DATA_DIR, OUTPUT_DIR
from models.project import Project
from services.video import probe
from services.render import render_mix
from services.youtube_source import list_playlist, download_videos

st.set_page_config(page_title="Nexera Video Mixer", layout="wide")
st.title("NEXERA VIDEO MIXER")
name = st.text_input("Nombre del proyecto", "Microfilm Llifén")
duration = st.number_input("Duración (segundos)", min_value=1.0, value=60.0)
aspect = st.selectbox("Formato", ["16:9", "9:16", "1:1"])
minimum = st.number_input("Duración mínima clip", min_value=0.5, value=5.0)
maximum = st.number_input("Duración máxima clip", min_value=0.5, value=10.0)
keep_audio = st.checkbox("Conservar audio original", True)
title = st.text_input("Título opcional", "")
watermark = st.text_input("Watermark opcional", "")
music_upload = st.file_uploader("Música opcional", type=["mp3", "wav", "m4a", "aac"])
uploads = st.file_uploader("Agregar videos", type=["mp4", "mov", "m4v", "webm"], accept_multiple_files=True)
playlist_url = st.text_input("O usar playlist de YouTube (pública u oculta)", "")

playlist_items = []
if playlist_url:
    if st.button("CARGAR PLAYLIST"):
        try:
            st.session_state.playlist_items = list_playlist(playlist_url)
        except Exception as exc:
            st.error(f"No se pudo leer la playlist: {exc}")
    playlist_items = st.session_state.get("playlist_items", [])
    if playlist_items:
        labels = [f"{i+1}. {item['title']}" for i, item in enumerate(playlist_items)]
        selected = st.multiselect("Videos de la playlist", labels, default=labels)
        playlist_items = [item for label, item in zip(labels, playlist_items) if label in selected]

if uploads:
    preview_rows = []
    for upload in uploads:
        with tempfile.NamedTemporaryFile(suffix=Path(upload.name).suffix, delete=True) as preview:
            preview.write(upload.getbuffer()); preview.flush()
            try: preview_rows.append(probe(Path(preview.name)))
            except Exception: pass
    if preview_rows: st.dataframe(preview_rows, use_container_width=True)

generate = st.button("GENERAR MEZCLA", type="primary", disabled=not (uploads or playlist_items))
if generate:
    with tempfile.TemporaryDirectory() as temp:
        music_path = None
        paths = []
        rows = []
        if music_upload:
            music_path = Path(temp) / music_upload.name
            music_path.write_bytes(music_upload.getbuffer())
        if playlist_items:
            with st.spinner("Descargando videos seleccionados de YouTube..."):
                try:
                    downloaded = download_videos(playlist_items, Path(temp) / "youtube")
                    uploads = list(uploads or [])
                    paths = list(downloaded)
                    for path in downloaded:
                        rows.append(probe(path))
                except Exception as exc:
                    st.error(f"No se pudieron descargar los videos: {exc}")
        for upload in uploads or []:
            path = Path(temp) / upload.name
            path.write_bytes(upload.getbuffer())
            try: rows.append(probe(path)); paths.append(path)
            except Exception as exc: st.error(f"{upload.name}: {exc}")
        if rows:
            project = Project(name=name, duration=duration, clip_min_duration=minimum, clip_max_duration=maximum,
                              keep_original_audio=keep_audio, source_videos=[r["name"] for r in rows])
            project.save(DATA_DIR / "projects")
            with st.spinner("Analizando, generando clips y renderizando..."):
                try:
                    output, timeline = render_mix(rows, OUTPUT_DIR, duration, keep_audio, minimum=minimum, maximum=maximum, aspect=aspect, title=title or None, watermark=watermark or None, music=music_path)
                    st.success(f"Mezcla generada: {output.name}")
                    st.video(str(output)); st.download_button("Descargar MP4", output.read_bytes(), output.name, "video/mp4")
                except Exception as exc: st.exception(exc)
