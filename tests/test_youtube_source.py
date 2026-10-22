from unittest.mock import patch

from services import youtube_source


def test_public_playlist_uses_youtube_api_without_user_login(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    responses = [
        {"items": [{"snippet": {"title": "Track", "resourceId": {"videoId": "abcDEF12345"}}}]},
        {"items": [{"id": "abcDEF12345", "contentDetails": {"duration": "PT3M12S"}}]},
    ]

    def fake_api(path, params):
        return responses.pop(0)

    with patch.object(youtube_source, "_youtube_api", side_effect=fake_api) as api:
        result = youtube_source.list_playlist("https://www.youtube.com/playlist?list=PL_public123")

    assert result == [{"id": "abcDEF12345", "title": "Track",
                       "url": "https://www.youtube.com/watch?v=abcDEF12345", "duration": 192}]
    assert [call.args[0] for call in api.call_args_list] == ["playlistItems", "videos"]


def test_public_playlist_paginates(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    responses = [
        {"items": [{"snippet": {"title": "One", "resourceId": {"videoId": "abcDEF12345"}}}],
         "nextPageToken": "next"},
        {"items": [{"snippet": {"title": "Two", "resourceId": {"videoId": "xyzDEF12345"}}}]},
        {"items": []},
        {"items": []},
    ]

    with patch.object(youtube_source, "_youtube_api", side_effect=responses) as api:
        result = youtube_source.list_playlist("https://www.youtube.com/playlist?list=PL_public123")

    assert [item["title"] for item in result] == ["One", "Two"]
    assert api.call_args_list[1].args[1]["pageToken"] == "next"


def test_rejects_non_youtube_or_missing_playlist_id():
    for url in ("https://example.com/?list=PL123", "https://youtube.com/watch?v=abcDEF12345"):
        try:
            youtube_source._playlist_id(url)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid playlist URL should be rejected")


def test_duration_parsing():
    assert youtube_source._duration_seconds("PT1H2M3S") == 3723
    assert youtube_source._duration_seconds(None) is None
