"""
SyncSpace Notification Service
-------------------------------
Creates in-app notifications and, when the user has opted in, sends an email
via the system SMTP in a background thread so it never blocks the caller.
"""
import threading

from app import supabase


# ── Public entry-point ─────────────────────────────────────────────────────────

def create_notification(user_id, type, title, message,
                        reference_id=None, reference_type=None):
    """
    Insert an in-app notification for *user_id*.
    If the user has enabled email for this *type*, send an email in the
    background (fire-and-forget — never raises).
    """
    try:
        supabase.table("notifications").insert({
            "user_id":        user_id,
            "type":           type,
            "title":          title,
            "message":        message,
            "reference_id":   str(reference_id) if reference_id else None,
            "reference_type": reference_type,
            "is_read":        False,
        }).execute()
    except Exception as e:
        print(f"[NOTIF] Insert error: {e}")
        return  # don't attempt email if the in-app notification failed

    # Fire-and-forget email — daemon thread so it never blocks Flask shutdown
    t = threading.Thread(
        target=_maybe_send_email,
        args=(user_id, type, title, message, reference_id, reference_type),
        daemon=True,
    )
    t.start()


# ── Background email logic ─────────────────────────────────────────────────────

def _maybe_send_email(user_id, notif_type, title, message,
                      reference_id, reference_type):
    """Check user's email preference and dispatch if enabled."""
    try:
        from app.services.email import is_email_configured, get_email_config, send_email

        if not is_email_configured():
            return

        # Check opt-in row (absent → default False)
        pref = supabase.table("notification_preferences") \
            .select("email_enabled") \
            .eq("user_id", user_id) \
            .eq("type", notif_type) \
            .execute()
        if not pref.data or not pref.data[0].get("email_enabled"):
            return

        # Fetch recipient
        user_row = supabase.table("users") \
            .select("email,full_name") \
            .eq("id", user_id) \
            .execute()
        if not user_row.data:
            return
        to_email   = (user_row.data[0].get("email") or "").strip()
        user_name  = user_row.data[0].get("full_name") or "there"
        if not to_email:
            return

        # Build URLs
        cfg          = get_email_config()
        base         = (cfg.get("frontend_url") or "http://localhost:5173").rstrip("/")
        cta_url      = _cta_url(base, notif_type, reference_id, reference_type)
        settings_url = f"{base}/settings"

        html = _build_email(notif_type, title, message, user_name,
                            cta_url, settings_url)
        ok, err = send_email(to_email, f"SyncSpace — {title}", html)
        if not ok:
            print(f"[EMAIL NOTIF] Failed ({to_email}): {err}")

    except Exception as e:
        print(f"[EMAIL NOTIF] Unexpected error: {e}")


# ── URL helpers ────────────────────────────────────────────────────────────────

def _cta_url(base: str, notif_type: str, reference_id, reference_type) -> str:
    if notif_type in ("meeting_invite", "meeting_update", "meeting_cancelled",
                      "response_accepted", "response_rejected"):
        return f"{base}/meetings"
    if notif_type == "task_assigned":
        return f"{base}/tasks"
    if notif_type == "project_assigned":
        if reference_id and reference_type == "project":
            return f"{base}/projects/{reference_id}"
        return f"{base}/projects"
    if notif_type == "approval_status":
        return f"{base}/dashboard"
    # Generic fallbacks keyed on reference_type
    if reference_type == "meeting":
        return f"{base}/meetings"
    if reference_type == "task":
        return f"{base}/tasks"
    if reference_type == "project":
        return (f"{base}/projects/{reference_id}"
                if reference_id else f"{base}/projects")
    return f"{base}/notifications"


# ── Email template ─────────────────────────────────────────────────────────────

# (accent colour, emoji, CTA button text)
_TYPE_STYLE: dict[str, tuple] = {
    "meeting_invite":    ("#3b82f6", "📅", "View Meeting"),
    "meeting_update":    ("#f59e0b", "🔔", "View Meeting"),
    "meeting_cancelled": ("#ef4444", "❌", "View Meetings"),
    "task_assigned":     ("#8b5cf6", "✅", "View Task"),
    "project_assigned":  ("#6366f1", "📁", "View Project"),
    "approval_status":   ("#10b981", "🎉", "Go to Dashboard"),
    "response_accepted": ("#10b981", "✓",  "View Meeting"),
    "response_rejected": ("#ef4444", "✗",  "View Meeting"),
}
_DEFAULT_STYLE = ("#3b82f6", "🔔", "Open SyncSpace")


def _build_email(notif_type: str, title: str, message: str,
                 user_name: str, cta_url: str, settings_url: str) -> str:
    color, emoji, cta_label = _TYPE_STYLE.get(notif_type, _DEFAULT_STYLE)

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#070d1a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#070d1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#0f1729;
             border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#1e2d4a;padding:22px 32px;
                     border-bottom:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:22px;font-weight:700;color:#3b82f6;">SyncSpace</span>
          </td>
        </tr>

        <!-- Icon -->
        <tr>
          <td style="padding:28px 32px 0;text-align:center;">
            <div style="display:inline-block;width:56px;height:56px;border-radius:50%;
                        background:{color};text-align:center;line-height:56px;
                        font-size:26px;">
              {emoji}
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:20px 32px 32px;">
            <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;
                       color:#f1f5f9;text-align:center;">
              {title}
            </h1>

            <p style="margin:0 0 16px;color:#64748b;font-size:13px;text-align:center;">
              Hi {user_name},
            </p>
            <p style="margin:0 0 28px;color:#94a3b8;line-height:1.7;font-size:14px;">
              {message}
            </p>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:{color};border-radius:8px;">
                  <a href="{cta_url}"
                     style="display:inline-block;padding:13px 32px;color:#fff;
                            font-weight:600;font-size:14px;text-decoration:none;
                            letter-spacing:0.01em;">
                    {cta_label} &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);
                       margin:0 0 16px;">
            <p style="margin:0;color:#475569;font-size:12px;line-height:1.6;">
              You received this because you enabled email notifications in
              SyncSpace.
              <a href="{settings_url}" style="color:#3b82f6;text-decoration:none;">
                Manage notification preferences &rarr;
              </a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
