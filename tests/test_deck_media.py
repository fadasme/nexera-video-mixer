from pathlib import Path
from unittest.mock import MagicMock, patch
import subprocess
from services import deck_media

def test_prepare_audio_and_cache(tmp_path):
    source=tmp_path/'tone.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440','-f','lavfi','-i','color=blue:s=320x180:r=25',
                    '-t','1',str(source)],check=True)
    downloader=MagicMock()
    downloader.__enter__.return_value=downloader
    downloader.extract_info.return_value={'id':'KSMCybhA8ho'}
    downloader.prepare_filename.return_value=str(source)
    with patch.object(deck_media,'CACHE',tmp_path/'cache'), patch.object(deck_media.yt_dlp,'YoutubeDL',return_value=downloader):
        deck_media.prepare('KSMCybhA8ho')
        assert deck_media.states['KSMCybhA8ho']['status']=='ready'
        from services.video import probe
        media=probe(tmp_path/'cache/KSMCybhA8ho.mp4')
        assert media['codec']=='h264' and media['has_audio']
        with patch.object(deck_media.pool,'submit') as submit:
            assert deck_media.request_audio('KSMCybhA8ho')['status']=='ready'
            submit.assert_not_called()

def test_download_failure_is_visible(tmp_path):
    with patch.object(deck_media,'CACHE',tmp_path), patch.object(deck_media.yt_dlp,'YoutubeDL',side_effect=RuntimeError('Sin conexión')):
        deck_media.prepare('kyzIQKuSqBs')
        assert deck_media.states['kyzIQKuSqBs']=={'status':'failed','message':'Sin conexión'}
