"""
SyncSpace Email Service
-----------------------
Sends transactional emails via Gmail SMTP using an App Password.
Config is stored in system_settings (keys: smtp_email, smtp_app_password, frontend_url).
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app import supabase


# ── Config helpers ─────────────────────────────────────────────────────────────

def get_email_config() -> dict:
    """Read smtp_email, smtp_app_password, frontend_url from system_settings."""
    rows = supabase.table("system_settings").select("key,value").in_(
        "key", ["smtp_email", "smtp_app_password", "frontend_url"]
    ).execute()
    return {row["key"]: (row["value"] or "") for row in (rows.data or [])}


def is_email_configured() -> bool:
    cfg = get_email_config()
    return bool(cfg.get("smtp_email") and cfg.get("smtp_app_password"))


# ── Core send ──────────────────────────────────────────────────────────────────

def send_email(to_email: str, subject: str, html_body: str) -> tuple:
    """
    Send an HTML email via Gmail SMTP.
    Returns (success: bool, error_message: str).
    """
    cfg = get_email_config()
    smtp_email    = cfg.get("smtp_email", "").strip()
    # Strip ALL spaces — Google displays App Passwords as "xxxx xxxx xxxx xxxx"
    # but Gmail SMTP requires the raw 16-character string with no spaces.
    smtp_password = cfg.get("smtp_app_password", "").replace(" ", "").strip()

    if not smtp_email or not smtp_password:
        return False, (
            "Email is not configured. "
            "Go to Admin Panel → Settings → Email Configuration."
        )

    # Debug log — visible in the Flask console (never logged to user-facing output)
    print(f"[EMAIL] Sending to={to_email} from={smtp_email} "
          f"pass_len={len(smtp_password)} pass_has_space={' ' in smtp_password}")

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"SyncSpace <{smtp_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, [to_email], msg.as_string())

        print(f"[EMAIL] Sent OK to {to_email}")
        return True, ""

    except smtplib.SMTPAuthenticationError as e:
        print(f"[EMAIL] SMTPAuthenticationError: {e}")
        return False, (
            "Gmail authentication failed. "
            f"Account: {smtp_email} | Password length stored: {len(smtp_password)} chars "
            "(should be 16). "
            "Make sure you generated an App Password at "
            "myaccount.google.com/apppasswords and pasted it into Admin → Settings."
        )
    except smtplib.SMTPRecipientsRefused:
        return False, f"Recipient address refused by Gmail: {to_email}"
    except smtplib.SMTPConnectError:
        return False, "Could not connect to smtp.gmail.com — check network/firewall."
    except Exception as e:
        return False, str(e)


# ── Branded invitation email ───────────────────────────────────────────────────

def send_invitation_email(
    to_email: str,
    invite_token: str,
    invited_by_name: str,
    role: str,
    department: str,
) -> tuple:
    """Build and send the invitation HTML email."""
    cfg = get_email_config()
    frontend_url = (cfg.get("frontend_url") or "http://localhost:5173").rstrip("/")
    invite_url   = f"{frontend_url}/invite/{invite_token}"

    dept_line = (
        f' in the <strong style="color:#fff">{department}</strong> department'
        if department else ""
    )

    html = f"""<!DOCTYPE html>
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
            <span style="font-size:22px;font-weight:700;color:#3b82f6;">
              SyncSpace
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;
                       color:#f1f5f9;">You&rsquo;re Invited!</h1>

            <p style="margin:0 0 20px;color:#94a3b8;line-height:1.6;">
              <strong style="color:#fff">{invited_by_name}</strong>
              has invited you to join <strong style="color:#fff">SyncSpace</strong>
              as a <strong style="color:#a78bfa;text-transform:capitalize">{role}</strong>{dept_line}.
            </p>

            <p style="margin:0 0 24px;color:#94a3b8;line-height:1.6;">
              Click the button below to create your account.
              You&rsquo;re pre-approved &mdash; no administrator review needed.
            </p>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="background:#3b82f6;border-radius:8px;">
                  <a href="{invite_url}"
                     style="display:inline-block;padding:13px 28px;color:#fff;
                            font-weight:600;font-size:15px;text-decoration:none;">
                    Accept Invitation &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- Fallback link -->
            <p style="margin:0 0 6px;color:#64748b;font-size:12px;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0 0 24px;color:#3b82f6;font-size:12px;
                      word-break:break-all;">{invite_url}</p>

            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);
                       margin:0 0 16px;">
            <p style="margin:0;color:#64748b;font-size:12px;">
              This invitation expires in&nbsp;7&nbsp;days.
              If you didn&rsquo;t expect this, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    return send_email(
        to_email,
        f"You've been invited to SyncSpace by {invited_by_name}",
        html,
    )
