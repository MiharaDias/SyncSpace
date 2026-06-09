import bcrypt
import time
import httpx
from flask_jwt_extended import get_jwt_identity
from flask import jsonify
from functools import wraps
from flask_jwt_extended import verify_jwt_in_request
from app import supabase


def q_single(query):
    """
    Safe replacement for .single().execute().
    Returns the first row as a dict, or None — never raises PGRST116.
    Usage:  row = q_single(supabase.table("x").select("*").eq("id", x_id))
    """
    try:
        res = query.execute()
        return res.data[0] if res.data else None
    except Exception:
        return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _supabase_retry(fn, retries: int = 3, backoff: float = 0.2):
    """
    Execute a supabase query callable with retry on HTTP/2 RemoteProtocolError.

    Supabase uses HTTP/2 keep-alive connections that the server closes when idle.
    httpx raises RemoteProtocolError when it tries to reuse a dead connection.
    A simple retry re-establishes the connection transparently.
    """
    for attempt in range(retries):
        try:
            return fn()
        except (httpx.RemoteProtocolError, httpx.ReadError) as exc:
            if attempt < retries - 1:
                time.sleep(backoff * (2 ** attempt))   # 0.2s, 0.4s, …
            else:
                raise RuntimeError(
                    f"Supabase connection failed after {retries} retries: {exc}"
                ) from exc


def get_current_user():
    """
    Fetch the current user from the database.
    Returns the user dict or None if not found.
    Uses .execute() + data[0] instead of .single() to avoid PGRST116
    when the user is not found (single() raises on 0 rows).
    """
    user_id = get_jwt_identity()
    if not user_id:
        return None
    res = _supabase_retry(
        lambda: supabase.table("users").select("*").eq("id", user_id).execute()
    )
    return res.data[0] if res.data else None


def require_roles(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = get_current_user()
            if not user or user.get("role") not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            if not user.get("is_approved"):
                return jsonify({"error": "Account pending approval"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_approved():
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = get_current_user()
            if not user:
                return jsonify({"error": "User not found"}), 404
            if not user.get("is_approved"):
                return jsonify({"error": "Account pending approval"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
