from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, get_current_user, require_roles, q_single
from app.services.notifications import create_notification
from datetime import datetime

tasks_bp = Blueprint("tasks", __name__)

# ── Status compatibility map ──────────────────────────────────────────────────
# Before the migration is run the tasks table has a CHECK constraint that only
# allows the old ENUM-style values.  This map lets us store whichever format
# the DB actually accepts.  Once the migration drops the constraint, the new
# human-readable names are stored directly.
_STATUS_COMPAT = {
    "Not Started": "todo",
    "In Progress":  "in_progress",
    "Completed":    "done",
    "On Hold":      "review",
    "Cancelled":    "done",     # closest old value; migration removes this need
}

_CONSTRAINED_STATUSES = {"todo", "in_progress", "review", "done"}


def _safe_status(status: str) -> str:
    """
    Return `status` as-is if the migration has been applied (TEXT column,
    no CHECK constraint).  Falls back to the old ENUM-compatible value so
    task creation never fails with 23514 before the migration is run.
    This wrapper is a no-op after `ALTER TABLE tasks DROP CONSTRAINT tasks_status_check`.
    """
    return status   # after migration this is always the right path


# ── Access helpers ────────────────────────────────────────────────────────────

def _project_access(project_id: str, user_id: str, user: dict) -> tuple:
    """Returns (project, error_response). Checks user can access the project."""
    proj = q_single(supabase.table("projects").select("*").eq("id", project_id))
    if not proj:
        return None, (jsonify({"error": "Project not found"}), 404)
    if user["role"] == "administrator":
        return proj, None
    if proj.get("creator_id") == user_id:
        return proj, None
    mem = supabase.table("project_members").select("id").eq(
        "project_id", project_id).eq("user_id", user_id).execute()
    if mem.data:
        return proj, None
    # Department visibility
    user_depts = user.get("departments") or ([user.get("department")] if user.get("department") else [])
    if proj.get("visibility") == "department":
        for d in (proj.get("visibility_departments") or []):
            if d in user_depts:
                return proj, None
    return None, (jsonify({"error": "Not authorised to access this project"}), 403)


def _assert_task_access(task_id: str, user_id: str, user: dict):
    """Returns (task, None) or (None, error) — read access."""
    task = q_single(supabase.table("tasks").select("*").eq("id", task_id))
    if not task:
        return None, (jsonify({"error": "Task not found"}), 404)
    if user["role"] == "administrator":
        return task, None
    if task.get("project_id"):
        proj, err = _project_access(task["project_id"], user_id, user)
        if err:
            return None, err
        return task, None
    if task.get("assigned_to") == user_id or task.get("created_by") == user_id:
        return task, None
    if user["role"] == "manager":
        return task, None
    return None, (jsonify({"error": "Not authorised"}), 403)


def _assert_task_edit(task: dict, user_id: str, user: dict):
    """Returns None if the caller may edit/delete the task, else an error tuple."""
    if user["role"] == "administrator":
        return None
    if task.get("created_by") == user_id:
        return None
    if user["role"] == "manager":
        task_dept = task.get("department", "")
        user_depts = user.get("departments") or ([user.get("department")] if user.get("department") else [])
        if not task_dept or task_dept in user_depts:
            return None
    return jsonify({"error": "Not authorised to edit this task"}), 403


def _enrich_task(task: dict) -> dict:
    """Add assignee info, sub-deadlines, and project name to a task."""
    if task.get("assigned_to"):
        task["assigned_user"] = q_single(
            supabase.table("users").select("id,full_name,email,profile_picture")
            .eq("id", task["assigned_to"])
        )
    else:
        task["assigned_user"] = None

    subs = supabase.table("task_sub_deadlines").select("*").eq(
        "task_id", task["id"]).order("due_date").execute()
    task["sub_deadlines"] = subs.data or []

    if task.get("project_id"):
        task["project"] = q_single(
            supabase.table("projects").select("id,name").eq("id", task["project_id"])
        )
    else:
        task["project"] = None

    return task


# ── Task CRUD ────────────────────────────────────────────────────────────────

@tasks_bp.route("/", methods=["GET"])
@jwt_required()
@require_approved()
def list_tasks():
    user_id = get_jwt_identity()
    user = get_current_user()

    project_id = request.args.get("project_id")
    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")
    assigned_to_filter = request.args.get("assigned_to")

    if project_id:
        # Tasks within a specific project
        proj, err = _project_access(project_id, user_id, user)
        if err:
            return err
        q = supabase.table("tasks").select(
            "*, assigned_user:assigned_to(id,full_name,email,profile_picture), creator:created_by(id,full_name)"
        ).eq("project_id", project_id)
    else:
        # "My Tasks" — tasks assigned to current user across all projects
        q = supabase.table("tasks").select(
            "*, assigned_user:assigned_to(id,full_name,email,profile_picture), creator:created_by(id,full_name)"
        )
        if user["role"] == "user":
            q = q.eq("assigned_to", user_id)
        elif user["role"] == "manager":
            # Manager sees tasks in their department's projects
            user_depts = user.get("departments") or ([user.get("department")] if user.get("department") else [])
            # Get accessible project IDs
            all_p = supabase.table("projects").select("id,visibility,visibility_departments").execute().data or []
            accessible_ids = []
            for p in all_p:
                if p.get("creator_id") == user_id:
                    accessible_ids.append(p["id"])
                    continue
                mem = supabase.table("project_members").select("id").eq(
                    "project_id", p["id"]).eq("user_id", user_id).execute()
                if mem.data:
                    accessible_ids.append(p["id"])
                    continue
                if p.get("visibility") == "department":
                    for d in (p.get("visibility_departments") or []):
                        if d in user_depts:
                            accessible_ids.append(p["id"])
                            break
            if accessible_ids:
                q = q.in_("project_id", accessible_ids)
            else:
                return jsonify([])

    if status_filter:
        q = q.eq("status", status_filter)
    if priority_filter:
        q = q.eq("priority", priority_filter)
    if assigned_to_filter and user["role"] != "user":
        q = q.eq("assigned_to", assigned_to_filter)

    result = q.order("created_at", desc=True).execute()
    tasks = result.data or []

    # Add sub-deadlines counts
    for t in tasks:
        subs = supabase.table("task_sub_deadlines").select("id,is_completed").eq(
            "task_id", t["id"]).execute().data or []
        t["sub_deadline_count"] = len(subs)
        t["sub_deadline_done"] = sum(1 for s in subs if s.get("is_completed"))

    return jsonify(tasks)


@tasks_bp.route("/", methods=["POST"])
@jwt_required()
@require_approved()
def create_task():
    user_id = get_jwt_identity()
    user = get_current_user()
    data = request.json or {}

    if not data.get("title", "").strip():
        return jsonify({"error": "title is required"}), 400
    if len(data["title"]) > 200:
        return jsonify({"error": "title too long (max 200 chars)"}), 400

    project_id = data.get("project_id")
    if project_id:
        # BUG FIX: validate project access before creating task
        proj, err = _project_access(project_id, user_id, user)
        if err:
            return err
    else:
        # Legacy: managers/admins can create without project
        if user["role"] == "user":
            return jsonify({"error": "Regular users must create tasks within a project"}), 403

    task = {
        "title": data["title"].strip(),
        "description": data.get("description", ""),
        "created_by": user_id,
        # BUG FIX: empty string → None to avoid UUID parse error
        "assigned_to": data.get("assigned_to") or None,
        "due_date": data.get("due_date") or None,
        "priority": data.get("priority", "medium"),
        "status": data.get("status", "Not Started"),
        "department": data.get("department", user.get("department", "")),
        "estimated_hours": data.get("estimated_hours") or None,
        "tags": data.get("tags", []),
        "project_id": project_id or None,
    }

    try:
        result = supabase.table("tasks").insert(task).execute()
        created = result.data[0]
    except Exception as e:
        err_str = str(e).lower()
        # Constraint 23514 = tasks_status_check violation: migration not run yet,
        # column still has the old ENUM-compatible CHECK constraint.
        # Map human-readable status → old ENUM value and retry.
        if "23514" in err_str or "status_check" in err_str:
            compat_status = _STATUS_COMPAT.get(task["status"], "todo")
            task2 = {**task, "status": compat_status}
            try:
                result = supabase.table("tasks").insert(task2).execute()
                created = result.data[0]
            except Exception as e2:
                return jsonify({"error": f"Failed to create task: {e2}"}), 500
        elif "project_id" in err_str or "custom_status" in err_str:
            # project_id column not yet added — strip it and retry
            fallback = {k: v for k, v in task.items() if k not in ("project_id", "custom_status")}
            try:
                result = supabase.table("tasks").insert(fallback).execute()
                created = result.data[0]
            except Exception as e2:
                return jsonify({"error": f"Failed to create task: {e2}"}), 500
        else:
            return jsonify({"error": f"Failed to create task: {e}"}), 500

    # Add sub-deadlines (non-critical — table may not exist before migration)
    for sub in data.get("sub_deadlines", []):
        if sub.get("title") and sub.get("due_date"):
            try:
                supabase.table("task_sub_deadlines").insert({
                    "task_id": created["id"],
                    "title": sub["title"].strip(),
                    "due_date": sub["due_date"],
                    "is_completed": False,
                }).execute()
            except Exception:
                pass

    # Audit (non-critical)
    try:
        supabase.table("task_audit_log").insert({
            "task_id": created["id"], "user_id": user_id,
            "action": "created", "new_value": data["title"],
        }).execute()
    except Exception:
        pass

    # Notify assignee
    if task["assigned_to"] and task["assigned_to"] != user_id:
        project_name = proj["name"] if project_id else "General"
        try:
            create_notification(
                task["assigned_to"], "task_assigned",
                "New Task Assigned",
                f"You've been assigned: '{data['title']}' in project '{project_name}'",
                created["id"], "task",
            )
        except Exception:
            pass

    return jsonify(_enrich_task(created)), 201


@tasks_bp.route("/dashboard", methods=["GET"])
@jwt_required()
@require_approved()
def task_dashboard():
    user_id = get_jwt_identity()
    user = get_current_user()
    project_id = request.args.get("project_id")

    if project_id:
        q = supabase.table("tasks").select("*").eq("project_id", project_id)
    elif user["role"] == "user":
        q = supabase.table("tasks").select("*").eq("assigned_to", user_id)
    elif user["role"] == "manager":
        user_depts = user.get("departments") or ([user.get("department")] if user.get("department") else [])
        all_p = supabase.table("projects").select("id").execute().data or []
        accessible_ids = []
        for p in all_p:
            mem = supabase.table("project_members").select("id").eq(
                "project_id", p["id"]).eq("user_id", user_id).execute()
            if mem.data:
                accessible_ids.append(p["id"])
        q = supabase.table("tasks").select("*")
        if accessible_ids:
            q = q.in_("project_id", accessible_ids)
    else:
        q = supabase.table("tasks").select("*")

    all_tasks = q.execute().data or []
    now = str(datetime.utcnow().date())

    stats = {
        "total": len(all_tasks),
        "not_started": sum(1 for t in all_tasks if t.get("status", "").lower() in ("not started", "not_started", "todo")),
        "in_progress": sum(1 for t in all_tasks if "progress" in t.get("status", "").lower()),
        "completed": sum(1 for t in all_tasks if t.get("status", "").lower() in ("completed", "done")),
        "overdue": sum(1 for t in all_tasks
                       if t.get("due_date") and str(t["due_date"]) < now
                       and t.get("status", "").lower() not in ("completed", "done", "cancelled")),
        # Keep legacy keys for dashboard compat
        "todo": sum(1 for t in all_tasks if t.get("status", "").lower() in ("not started", "not_started", "todo")),
        "review": sum(1 for t in all_tasks if t.get("status", "").lower() in ("review", "on hold")),
        "done": sum(1 for t in all_tasks if t.get("status", "").lower() in ("completed", "done")),
        "high_priority": sum(1 for t in all_tasks if t.get("priority") in ("high", "urgent")),
    }

    return jsonify(stats)


@tasks_bp.route("/my-stats", methods=["GET"])
@jwt_required()
@require_approved()
def my_task_stats():
    """Per-user stats: hours this week/month + active/completed task counts."""
    from datetime import date, timedelta
    user_id = get_jwt_identity()
    today = date.today()
    week_start  = (today - timedelta(days=today.weekday())).isoformat()   # Monday
    month_start = today.replace(day=1).isoformat()

    tasks = supabase.table("tasks").select(
        "id,status,completed_at,time_spent_minutes"
    ).eq("assigned_to", user_id).execute().data or []

    done_statuses = {"completed", "done"}
    skip_statuses = {"completed", "done", "cancelled"}

    active_tasks    = sum(1 for t in tasks if t.get("status", "").lower() not in skip_statuses)
    completed_tasks = sum(1 for t in tasks if t.get("status", "").lower() in done_statuses)

    mins_week  = 0
    mins_month = 0
    for t in tasks:
        if t.get("completed_at") and t.get("time_spent_minutes"):
            d    = t["completed_at"][:10]
            mins = t["time_spent_minutes"] or 0
            if d >= week_start:
                mins_week += mins
            if d >= month_start:
                mins_month += mins

    return jsonify({
        "hours_this_week":  round(mins_week  / 60, 1),
        "hours_this_month": round(mins_month / 60, 1),
        "active_tasks":     active_tasks,
        "completed_tasks":  completed_tasks,
    })


@tasks_bp.route("/<task_id>", methods=["GET"])
@jwt_required()
@require_approved()
def get_task(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    task, err = _assert_task_access(task_id, user_id, user)
    if err:
        return err
    return jsonify(_enrich_task(task))


@tasks_bp.route("/heatmap", methods=["GET"])
@jwt_required()
@require_approved()
def task_heatmap():
    from collections import defaultdict
    caller_id = get_jwt_identity()
    caller = get_current_user()
    target_id = request.args.get("user_id", caller_id)
    if target_id != caller_id and caller.get("role") != "administrator":
        return jsonify({"error": "Not authorized"}), 403
    year = int(request.args.get("year", datetime.utcnow().year))
    start = f"{year}-01-01T00:00:00"
    end   = f"{year}-12-31T23:59:59"
    res = supabase.table("tasks").select(
        "id,completed_at,time_spent_minutes"
    ).or_(f"assigned_to.eq.{target_id},created_by.eq.{target_id}").not_.is_(
        "completed_at", "null"
    ).gte("completed_at", start).lte("completed_at", end).execute()
    daily: dict = defaultdict(lambda: {"count": 0, "minutes": 0})
    for t in (res.data or []):
        if t.get("completed_at"):
            d = t["completed_at"][:10]
            daily[d]["count"] += 1
            daily[d]["minutes"] += t.get("time_spent_minutes") or 0
    return jsonify([
        {"date": d, "count": v["count"], "minutes": v["minutes"]}
        for d, v in sorted(daily.items())
    ])


@tasks_bp.route("/<task_id>", methods=["PUT"])
@jwt_required()
@require_approved()
def update_task(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    data = request.json or {}

    task, err = _assert_task_access(task_id, user_id, user)
    if err:
        return err

    # Role-based field permissions
    edit_err = _assert_task_edit(task, user_id, user)
    if edit_err and user["role"] == "user":
        # Regular users can only update their own tasks' status/hours
        if task.get("assigned_to") != user_id and task.get("created_by") != user_id:
            return jsonify({"error": "Not authorised to edit this task"}), 403

    if user["role"] == "user":
        allowed = ["status", "actual_hours", "time_spent_minutes"]
    else:
        allowed = ["title", "description", "assigned_to", "due_date", "priority",
                   "status", "department", "estimated_hours", "actual_hours", "tags",
                   "time_spent_minutes"]

    update_data = {k: (data[k] or None if k in ("assigned_to", "due_date") else data[k])
                   for k in allowed if k in data}

    if "status" in update_data and update_data["status"] != task["status"]:
        try:
            supabase.table("task_audit_log").insert({
                "task_id": task_id, "user_id": user_id,
                "action": "status_changed",
                "old_value": task["status"], "new_value": update_data["status"],
            }).execute()
        except Exception:
            pass
        if update_data["status"].lower() in ("completed", "done"):
            update_data["completed_at"] = datetime.utcnow().isoformat()

    if "assigned_to" in update_data and update_data["assigned_to"] != task.get("assigned_to"):
        try:
            supabase.table("task_audit_log").insert({
                "task_id": task_id, "user_id": user_id, "action": "assigned",
                "old_value": task.get("assigned_to"), "new_value": update_data["assigned_to"],
            }).execute()
        except Exception:
            pass
        if update_data["assigned_to"] and update_data["assigned_to"] != user_id:
            try:
                create_notification(
                    update_data["assigned_to"], "task_assigned",
                    "Task Assigned to You",
                    f"Task '{task['title']}' has been assigned to you.",
                    task_id, "task",
                )
            except Exception:
                pass

    update_data["updated_at"] = datetime.utcnow().isoformat()
    try:
        result = supabase.table("tasks").update(update_data).eq("id", task_id).execute()
    except Exception as e:
        # status_check constraint: map to compat value and retry
        if "23514" in str(e) or "status_check" in str(e):
            if "status" in update_data:
                update_data["status"] = _STATUS_COMPAT.get(update_data["status"], "todo")
            result = supabase.table("tasks").update(update_data).eq("id", task_id).execute()
        else:
            return jsonify({"error": f"Failed to update task: {e}"}), 500
    return jsonify(_enrich_task(result.data[0]))


@tasks_bp.route("/<task_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def delete_task(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()

    task, err = _assert_task_access(task_id, user_id, user)
    if err:
        return err

    edit_err = _assert_task_edit(task, user_id, user)
    if edit_err:
        return edit_err

    for tbl in ("task_audit_log", "task_comments", "task_sub_deadlines"):
        try:
            supabase.table(tbl).delete().eq("task_id", task_id).execute()
        except Exception:
            pass
    supabase.table("tasks").delete().eq("id", task_id).execute()
    return jsonify({"message": "Task deleted"})


# ── Sub-deadlines ─────────────────────────────────────────────────────────────

@tasks_bp.route("/<task_id>/sub-deadlines", methods=["POST"])
@jwt_required()
@require_approved()
def add_sub_deadline(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    task, err = _assert_task_access(task_id, user_id, user)
    if err:
        return err
    data = request.json or {}
    if not data.get("title") or not data.get("due_date"):
        return jsonify({"error": "title and due_date required"}), 400
    result = supabase.table("task_sub_deadlines").insert({
        "task_id": task_id,
        "title": data["title"].strip()[:200],
        "due_date": data["due_date"],
        "is_completed": False,
    }).execute()
    return jsonify(result.data[0]), 201


@tasks_bp.route("/<task_id>/sub-deadlines/<sub_id>", methods=["PUT"])
@jwt_required()
@require_approved()
def update_sub_deadline(task_id, sub_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    _, err = _assert_task_access(task_id, user_id, user)
    if err:
        return err
    data = request.json or {}
    upd = {}
    if "is_completed" in data:
        upd["is_completed"] = bool(data["is_completed"])
    if "title" in data:
        upd["title"] = data["title"].strip()[:200]
    if "due_date" in data:
        upd["due_date"] = data["due_date"]
    result = supabase.table("task_sub_deadlines").update(upd).eq("id", sub_id).eq(
        "task_id", task_id).execute()
    return jsonify(result.data[0] if result.data else {})


@tasks_bp.route("/<task_id>/sub-deadlines/<sub_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def delete_sub_deadline(task_id, sub_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    _, err = _assert_task_access(task_id, user_id, user)
    if err:
        return err
    supabase.table("task_sub_deadlines").delete().eq("id", sub_id).eq(
        "task_id", task_id).execute()
    return jsonify({"message": "Deleted"})


# ── Comments ──────────────────────────────────────────────────────────────────

def _assert_task_access_fn(task_id, user_id, user):
    """Wrapper for use in comment/audit endpoints."""
    task = q_single(supabase.table("tasks").select("*").eq("id", task_id))
    if not task:
        return None, (jsonify({"error": "Task not found"}), 404)
    if user["role"] == "administrator":
        return task, None
    if task.get("project_id"):
        _, err = _project_access(task["project_id"], user_id, user)
        if err:
            return None, err
        return task, None
    if user["role"] == "user" and task.get("assigned_to") != user_id:
        return None, (jsonify({"error": "Not authorised"}), 403)
    return task, None


@tasks_bp.route("/<task_id>/comments", methods=["GET"])
@jwt_required()
@require_approved()
def get_comments(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    _, err = _assert_task_access_fn(task_id, user_id, user)
    if err:
        return err
    result = supabase.table("task_comments").select(
        "*, user:user_id(id,full_name,profile_picture)"
    ).eq("task_id", task_id).order("created_at").execute()
    return jsonify(result.data)


@tasks_bp.route("/<task_id>/comments", methods=["POST"])
@jwt_required()
@require_approved()
def add_comment(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    _, err = _assert_task_access_fn(task_id, user_id, user)
    if err:
        return err
    data = request.json or {}
    content = data.get("content", "").strip()
    if not content:
        return jsonify({"error": "content is required"}), 400
    if len(content) > 5000:
        return jsonify({"error": "comment too long (max 5000 chars)"}), 400
    result = supabase.table("task_comments").insert({
        "task_id": task_id, "user_id": user_id, "content": content,
    }).execute()
    try:
        supabase.table("task_audit_log").insert({
            "task_id": task_id, "user_id": user_id,
            "action": "commented", "new_value": content[:100],
        }).execute()
    except Exception:
        pass
    return jsonify(result.data[0]), 201


@tasks_bp.route("/<task_id>/audit", methods=["GET"])
@jwt_required()
@require_approved()
def get_audit(task_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    _, err = _assert_task_access_fn(task_id, user_id, user)
    if err:
        return err
    result = supabase.table("task_audit_log").select(
        "*, user:user_id(id,full_name)"
    ).eq("task_id", task_id).order("created_at", desc=True).execute()
    return jsonify(result.data)
