import time
import httpx
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from supabase import create_client, Client
from .config import Config


# ── Global retry transport ─────────────────────────────────────────────────────
# Supabase uses HTTP/2 keep-alive connections.  After the server closes an idle
# connection, the next request through the stale pool raises RemoteProtocolError.
# Installing this transport on every httpx session ensures ALL queries auto-retry
# without wrapping individual .execute() calls.

class _RetryTransport(httpx.BaseTransport):
    """httpx transport wrapper that retries on stale HTTP/2 connection errors."""

    def __init__(self, wrapped: httpx.BaseTransport, retries: int = 3, backoff: float = 0.2):
        self._wrapped = wrapped
        self._retries = retries
        self._backoff = backoff

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        for attempt in range(self._retries):
            try:
                return self._wrapped.handle_request(request)
            except (httpx.RemoteProtocolError, httpx.ReadError):
                if attempt < self._retries - 1:
                    time.sleep(self._backoff * (2 ** attempt))
                else:
                    raise

    def close(self):
        self._wrapped.close()


def _install_retry_transport(supabase_client: Client, retries: int = 3, backoff: float = 0.2) -> None:
    """
    Patch the PostgREST httpx.Client so every query retries on disconnect.
    Works by replacing the session's transport(s) with _RetryTransport wrappers.
    """
    session: httpx.Client = supabase_client.postgrest.session

    def _wrap(t):
        return _RetryTransport(t, retries=retries, backoff=backoff)

    if getattr(session, "_transport", None) is not None:
        session._transport = _wrap(session._transport)

    if hasattr(session, "_mounts"):
        session._mounts = {
            pattern: (_wrap(t) if t is not None else None)
            for pattern, t in session._mounts.items()
        }

supabase: Client = None

# FIX C4: Create limiter at module level so @limiter.limit() decorators work
# at import time. init_app() binds it to the Flask app later in create_app().
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute"],
    storage_uri="memory://",   # swap to redis:// in production
)


def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False
    app.config.from_object(Config)

    # FIX H6: Security headers on every response
    @app.after_request
    def add_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # CSP – tighten further once you add a CDN / nonce strategy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; "
            "frame-ancestors 'none';"
        )
        return response

    CORS(app, origins=Config.CORS_ORIGINS, supports_credentials=True)
    JWTManager(app)
    limiter.init_app(app)      # bind the pre-created limiter to the Flask app

    global supabase
    supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)
    _install_retry_transport(supabase)   # auto-retry all queries on stale HTTP/2 connections

    from .routes.auth import auth_bp
    from .routes.users import users_bp
    from .routes.meetings import meetings_bp
    from .routes.calendar import calendar_bp
    from .routes.tasks import tasks_bp
    from .routes.notifications import notifications_bp
    from .routes.admin import admin_bp
    from .routes.manager import manager_bp
    from .routes.busy import busy_bp
    from .routes.google_oauth import google_oauth_bp
    from .routes.projects import projects_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(users_bp, url_prefix="/api/users")
    app.register_blueprint(meetings_bp, url_prefix="/api/meetings")
    app.register_blueprint(calendar_bp, url_prefix="/api/calendar")
    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(manager_bp, url_prefix="/api/manager")
    app.register_blueprint(busy_bp, url_prefix="/api/busy")
    app.register_blueprint(google_oauth_bp, url_prefix="/api/auth/google")
    app.register_blueprint(projects_bp, url_prefix="/api/projects")

    # FIX L2: Health check doesn't reveal internals
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    # ── Midnight Google Calendar batch sync ───────────────────────────────────
    # Pull the latest Google Calendar events for all connected users once a day
    # at midnight (UTC).  In Flask dev mode the reloader spawns two processes;
    # only start the scheduler inside the reloader child (WERKZEUG_RUN_MAIN=true)
    # so the job doesn't fire twice.
    import os
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.cron import CronTrigger

            def _midnight_gcal_sync():
                with app.app_context():
                    try:
                        from app.routes.calendar import sync_user_google_calendar
                        users = supabase.table("users") \
                            .select("id") \
                            .eq("google_connected", True) \
                            .eq("is_approved", True) \
                            .eq("is_active", True) \
                            .execute().data or []
                        for u in users:
                            try:
                                sync_user_google_calendar(u["id"])
                            except Exception:
                                pass
                    except Exception:
                        pass

            _scheduler = BackgroundScheduler(daemon=True)
            _scheduler.add_job(
                _midnight_gcal_sync,
                CronTrigger(hour=0, minute=0, timezone="UTC"),
                id="gcal_midnight_sync",
                replace_existing=True,
            )
            _scheduler.start()
        except ImportError:
            pass  # APScheduler not installed; midnight sync skipped

    return app
