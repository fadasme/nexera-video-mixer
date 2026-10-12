from fastapi.staticfiles import StaticFiles

from api import app


app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")
