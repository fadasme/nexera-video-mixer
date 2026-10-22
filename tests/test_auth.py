from http.cookies import SimpleCookie
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.responses import Response

import api
from services import auth


def test_password_hash_session_and_revocation(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXERA_AUTH_DB", str(tmp_path / "auth.sqlite3"))
    account = auth.create_user("dj.admin", "a-very-long-test-password", "admin")
    assert auth.authenticate("DJ.ADMIN", "a-very-long-test-password")["id"] == account["id"]
    assert auth.authenticate("dj.admin", "wrong-password") is None

    token = auth.create_session(account["id"])
    assert auth.user_for_session(token)["role"] == "admin"
    auth.revoke_session(token)
    assert auth.user_for_session(token) is None


def test_auth_endpoints_and_admin_can_create_user(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXERA_AUTH_DB", str(tmp_path / "auth.sqlite3"))
    monkeypatch.setenv("NEXERA_COOKIE_SECURE", "false")
    auth.create_user("admin", "initial-admin-password", "admin")
    user = auth.create_user("regular", "initial-user-password", "user")

    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), cookies={})
    with pytest.raises(HTTPException) as unauthenticated:
        api.authenticated_user(request)
    assert unauthenticated.value.status_code == 401

    response = Response()
    result = api.login(request, response, api.LoginRequest(username="regular", password="initial-user-password"))
    assert result["user"]["id"] == user["id"]
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    token = cookie[auth.SESSION_COOKIE].value
    logged_in_user = auth.user_for_session(token)
    assert logged_in_user["role"] == "user"
    with pytest.raises(HTTPException) as forbidden:
        api.administrator(logged_in_user)
    assert forbidden.value.status_code == 403

    admin_response = Response()
    admin_login = api.login(request, admin_response, api.LoginRequest(username="admin", password="initial-admin-password"))
    admin_user = auth.user_for_session(SimpleCookie(admin_response.headers["set-cookie"])[auth.SESSION_COOKIE].value)
    assert admin_login["user"]["role"] == "admin"
    created = api.create_user(api.CreateUserRequest(username="second.user", password="another-long-password"), admin_user)
    assert created["user"]["role"] == "user"
    assert len(api.users(admin_user)["users"]) == 3


def test_protected_api_routes_require_a_session():
    protected_paths = {
        "/api/decks/{video_id}", "/api/decks/{video_id}/audio", "/api/renders",
        "/api/renders/{job_id}", "/api/renders/{job_id}/video", "/api/youtube/playlist",
        "/api/admin/users",
    }
    for route in api.app.routes:
        if getattr(route, "path", None) in protected_paths and hasattr(route, "dependant"):
            assert route.dependant.dependencies, route.path


def test_auth_database_file_is_private(tmp_path, monkeypatch):
    db_path = tmp_path / "auth.sqlite3"
    monkeypatch.setenv("NEXERA_AUTH_DB", str(db_path))
    auth.create_user("admin", "initial-admin-password", "admin")
    assert db_path.stat().st_mode & 0o777 == 0o600
