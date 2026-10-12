"""Single-process local jobs; restart discards job state."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import logging
from services.youtube_source import download_videos
from services.video import probe
from services.render import render_mix
from config.settings import OUTPUT_DIR

executor = ThreadPoolExecutor(max_workers=1)
jobs = {}

def run_job(job_id, ids, duration, aspect):
    job = jobs[job_id]
    try:
        with TemporaryDirectory(prefix='nexera-') as temp:
            sources = []
            for index, video_id in enumerate(ids):
                job.update(status='running', message=f'Descargando {index+1}/{len(ids)}')
                sources.extend(download_videos([{'id': video_id}], Path(temp)/'sources'))
            job['message'] = 'Generando clips y MP4…'
            result, clips = render_mix([probe(p) for p in sources], OUTPUT_DIR, duration,
                                      clip_dir=Path(temp)/'clips', minimum=0.5,
                                      maximum=10, aspect=aspect)
            job.update(status='complete', message='Mezcla terminada', file=result.name,
                       duration=probe(result)['duration'])
    except Exception as exc:
        logging.exception('Render %s failed', job_id)
        job.update(status='failed', message=str(exc))

def submit(ids, duration, aspect):
    job_id = str(uuid4())
    jobs[job_id] = {'id': job_id, 'status': 'queued', 'message': 'En cola'}
    executor.submit(run_job, job_id, ids, duration, aspect)
    return dict(jobs[job_id])
