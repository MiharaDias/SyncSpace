from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, get_current_user, q_single
from app.services.notifications import create_notification
from datetime import datetime

projects_bp = Blueprint("projects", __name__)

_DEFAULT_STATUSES = [
    {"name": "Not Started", "color": "#6b7280", "sort_order": 0},
    {"name": "In Progress",  "color": "#3b82f6", "sort_order": 1},
    {"name": "Completed",    "color": "#22c55e", "sort_order": 2},
    {"name": "On Hold",      "color": "#f59e0b", "sort_order": 3},
    {"name": "Cancelled",    "color": "#ef4444", "sort_order": 4},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_departments(user: dict) -> list:
    depts = user.get("departments") or []
    if not depts and user.get("department"):
        depts = [user["department"]]
    return depts


def _is_accessible(project: dict, user_id: str, user_depts: list, role: str) -> bool:
    if role == "administrator":
        return True
    if project.get("creator_id") == user_id:
        return True
    mem = supabase.table("project_members").select("id,role").eq(
        "project_id", project["id"]).eq("user_id", user_id).execute()
    if mem.data:
        return True
    vis = project.get("visibility", "department")
    if vis in ("members", "users"):
        # Only explicitly added members and admins can see this project
        # "users" is the legacy value — treated identically to "members"
        return False
    if vis == "department":
        for d in (project.get("visibility_departments") or []):
            if d in user_depts:
                return True
    # 'private' — only creator and admins (handled above)
    return False


def _can_manage(project: dict, user_id: str, role: str) -> bool:
    if role == "administrator":
        return True
    if project.get("creator_id") == user_id:
        return True
    mem = q_single(
        supabase.table("project_members").select("role").eq(
            "project_id", project["id"]).eq("user_id", user_id)
    )
    return bool(mem and mem.get("role") == "manager")


def _enrich(p: dict) -> dict:
    tasks = supabase.table("tasks").select("id,status").eq(
        "project_id", p["id"]).execute().data or []
    members = supabase.table("project_members").select(
        "id,user_id,role,users!project_members_user_id_fkey(id,full_name,email,profile_picture)"
    ).eq("project_id", p["id"]).execute().data or []
    creator = None
    if p.get("creator_id"):
        creator = q_single(
            supabase.table("users").select("id,full_name,email").eq("id", p["creator_id"])
        )
    total = len(tasks)
    done = sum(1 for t in tasks if t.get("status", "").lower() in ("completed", "done"))
    progress = round(done / total * 100) if total > 0 else 0
    return {**p, "total_tasks": total, "completed_tasks": done, "progress": progress,
            "member_count": len(members), "members": members, "creator": creator}


def _get_project_or_404(project_id: str):
    """Return (project_dict, None) or (None, error_response)."""
    proj = q_single(supabase.table("projects").select("*").eq("id", project_id))
    if not proj:
        return None, (jsonify({"error": "Project not found"}), 404)
    return proj, None


# ── Routes ────────────────────────────────────────────────────────────────────

@projects_bp.route("/", methods=["GET"])
@jwt_required()
@require_approved()
def list_projects():
    user_id = get_jwt_identity()
    user = get_current_user()
    user_depts = _user_departments(user)
    dept_filter = request.args.get("department")

    all_p = supabase.table("projects").select("*").neq("status", "deleted").execute().data or []

    result = []
    for p in all_p:
        if not _is_accessible(p, user_id, user_depts, user["role"]):
            continue
        if dept_filter and dept_filter != "all" and user["role"] == "administrator":
            vis_depts = p.get("visibility_departments") or []
            if vis_depts and dept_filter not in vis_depts:
                continue
        result.append(_enrich(p))

    return jsonify(result)


@projects_bp.route("/", methods=["POST"])
@jwt_required()
@require_approved()
def create_project():
    user_id = get_jwt_identity()
    user = get_current_user()
    if user["role"] == "user":
        return jsonify({"error": "Only managers and admins can create projects"}), 403

    data = request.json or {}
    if not data.get("name", "").strip():
        return jsonify({"error": "Project name is required"}), 400
    if len(data["name"]) > 200:
        return jsonify({"error": "Name too long (max 200 chars)"}), 400

    project = {
        "name": data["name"].strip(),
        "description": data.get("description", ""),
        "creator_id": user_id,
        "start_date": data.get("start_date") or None,
        "end_date": data.get("end_date") or None,
        "status": "active",
        "visibility": data.get("visibility", "department"),
        "visibility_departments": data.get("visibility_departments", []),
    }
    result = supabase.table("projects").insert(project).execute()
    created = result.data[0]
    pid = created["id"]

    # Creator becomes manager member
    supabase.table("project_members").insert({
        "project_id": pid, "user_id": user_id,
        "role": "manager", "added_by": user_id,
    }).execute()

    # Add initial members
    for uid in data.get("member_ids", []):
        if uid == user_id:
            continue
        try:
            supabase.table("project_members").insert({
                "project_id": pid, "user_id": uid,
                "role": "member", "added_by": user_id,
            }).execute()
            create_notification(uid, "project_assigned", "Added to Project",
                f"You've been added to project '{created['name']}'.", pid, "project")
        except Exception:
            pass

    # Default statuses
    for s in _DEFAULT_STATUSES:
        try:
            supabase.table("project_custom_statuses").insert({**s, "project_id": pid}).execute()
        except Exception:
            pass

    _audit(pid, user_id, "created", f"Project '{created['name']}' created")
    return jsonify(_enrich(created)), 201


@projects_bp.route("/<project_id>", methods=["GET"])
@jwt_required()
@require_approved()
def get_project(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _is_accessible(proj, user_id, _user_departments(user), user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    return jsonify(_enrich(proj))


@projects_bp.route("/<project_id>", methods=["PUT"])
@jwt_required()
@require_approved()
def update_project(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised to edit this project"}), 403

    data = request.json or {}
    allowed = ["name", "description", "start_date", "end_date", "status",
               "visibility", "visibility_departments"]
    upd = {k: (data[k] or None if k in ("start_date", "end_date") else data[k])
           for k in allowed if k in data}
    upd["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("projects").update(upd).eq("id", project_id).execute()
    _audit(project_id, user_id, "updated", f"Fields updated: {list(upd.keys())}")
    return jsonify(_enrich(result.data[0]))


@projects_bp.route("/<project_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def delete_project(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised"}), 403

    supabase.table("projects").update({"status": "deleted"}).eq("id", project_id).execute()
    _audit(project_id, user_id, "deleted", "Project deleted")
    return jsonify({"message": "Project deleted"})


# ── Members ───────────────────────────────────────────────────────────────────

@projects_bp.route("/<project_id>/members", methods=["GET"])
@jwt_required()
@require_approved()
def get_members(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _is_accessible(proj, user_id, _user_departments(user), user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    members = supabase.table("project_members").select(
        "*, users!project_members_user_id_fkey(id,full_name,email,department,departments,role,profile_picture)"
    ).eq("project_id", project_id).execute()
    return jsonify(members.data)


@projects_bp.route("/<project_id>/members", methods=["POST"])
@jwt_required()
@require_approved()
def add_member(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised"}), 403

    data = request.json or {}
    new_uid = data.get("user_id")
    if not new_uid:
        return jsonify({"error": "user_id required"}), 400
    role = data.get("role", "member")

    # Only wrap the INSERT — keep notification/audit outside so their exceptions
    # don't mask a successful insert with a false 409.
    try:
        supabase.table("project_members").insert({
            "project_id": project_id, "user_id": new_uid,
            "role": role, "added_by": user_id,
        }).execute()
    except Exception:
        return jsonify({"error": "Already a member or invalid user"}), 409

    try:
        create_notification(new_uid, "project_assigned", "Added to Project",
            f"You've been added to project '{proj['name']}'.", project_id, "project")
    except Exception:
        pass
    _audit(project_id, user_id, "member_added", f"User {new_uid} added as {role}")
    return jsonify({"message": "Member added"})


@projects_bp.route("/<project_id>/members/<member_user_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def remove_member(project_id, member_user_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    if member_user_id == proj.get("creator_id"):
        return jsonify({"error": "Cannot remove project creator"}), 400

    supabase.table("project_members").delete().eq("project_id", project_id).eq(
        "user_id", member_user_id).execute()
    _audit(project_id, user_id, "member_removed", f"User {member_user_id} removed")
    return jsonify({"message": "Member removed"})


@projects_bp.route("/<project_id>/members/<member_user_id>/role", methods=["PUT"])
@jwt_required()
@require_approved()
def update_member_role(project_id, member_user_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    data = request.json or {}
    role = data.get("role", "member")
    if role not in ("member", "manager"):
        return jsonify({"error": "Invalid role"}), 400
    supabase.table("project_members").update({"role": role}).eq("project_id", project_id).eq(
        "user_id", member_user_id).execute()
    return jsonify({"message": "Role updated"})


# ── Custom Statuses ───────────────────────────────────────────────────────────

@projects_bp.route("/<project_id>/statuses", methods=["GET"])
@jwt_required()
@require_approved()
def get_statuses(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _is_accessible(proj, user_id, _user_departments(user), user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    statuses = supabase.table("project_custom_statuses").select("*").eq(
        "project_id", project_id).order("sort_order").execute()
    return jsonify(statuses.data)


@projects_bp.route("/<project_id>/statuses", methods=["POST"])
@jwt_required()
@require_approved()
def create_status(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    data = request.json or {}
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    existing = supabase.table("project_custom_statuses").select("id").eq(
        "project_id", project_id).execute()
    result = supabase.table("project_custom_statuses").insert({
        "project_id": project_id,
        "name": data["name"].strip(),
        "color": data.get("color", "#6366f1"),
        "sort_order": len(existing.data or []),
    }).execute()
    return jsonify(result.data[0]), 201


@projects_bp.route("/<project_id>/statuses/<status_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def delete_status(project_id, status_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _can_manage(proj, user_id, user["role"]):
        return jsonify({"error": "Not authorised"}), 403
    supabase.table("project_custom_statuses").delete().eq("id", status_id).eq(
        "project_id", project_id).execute()
    return jsonify({"message": "Status deleted"})


# ── Analytics ─────────────────────────────────────────────────────────────────

@projects_bp.route("/<project_id>/analytics", methods=["GET"])
@jwt_required()
@require_approved()
def project_analytics(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    proj, err = _get_project_or_404(project_id)
    if err:
        return err
    if not _is_accessible(proj, user_id, _user_departments(user), user["role"]):
        return jsonify({"error": "Not authorised"}), 403

    tasks = supabase.table("tasks").select("*").eq("project_id", project_id).execute().data or []
    members = supabase.table("project_members").select(
        "user_id,role,users!project_members_user_id_fkey(id,full_name,email)"
    ).eq("project_id", project_id).execute().data or []

    from datetime import datetime as dt
    now_str = str(dt.utcnow().date())
    total = len(tasks)
    completed = sum(1 for t in tasks if t.get("status", "").lower() in ("completed", "done"))
    in_progress = sum(1 for t in tasks if "progress" in t.get("status", "").lower())
    overdue = sum(1 for t in tasks
                  if t.get("due_date") and str(t["due_date"]) < now_str
                  and t.get("status", "").lower() not in ("completed", "done", "cancelled"))
    progress = round(completed / total * 100) if total > 0 else 0

    member_stats = []
    for m in members:
        uid = m["user_id"]
        u_tasks = [t for t in tasks if t.get("assigned_to") == uid]
        u_done = sum(1 for t in u_tasks if t.get("status", "").lower() in ("completed", "done"))
        member_stats.append({
            "user": m.get("users"),
            "role": m["role"],
            "assigned": len(u_tasks),
            "completed": u_done,
            "completion_rate": round(u_done / len(u_tasks) * 100) if u_tasks else 0,
        })

    status_breakdown: dict = {}
    for t in tasks:
        s = t.get("status", "Not Started")
        status_breakdown[s] = status_breakdown.get(s, 0) + 1

    return jsonify({
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "overdue": overdue,
        "progress": progress,
        "status_breakdown": status_breakdown,
        "member_stats": member_stats,
    })


@projects_bp.route("/analytics/overview", methods=["GET"])
@jwt_required()
@require_approved()
def analytics_overview():
    user_id = get_jwt_identity()
    user = get_current_user()
    user_depts = _user_departments(user)
    dept_filter = request.args.get("department")

    all_p = supabase.table("projects").select("*").neq("status", "deleted").execute().data or []
    my_projects = [p for p in all_p if _is_accessible(p, user_id, user_depts, user["role"])]

    if dept_filter and dept_filter != "all":
        my_projects = [p for p in my_projects if dept_filter in (p.get("visibility_departments") or [])]

    all_tasks = []
    for p in my_projects:
        tasks = supabase.table("tasks").select("*").eq("project_id", p["id"]).execute().data or []
        for t in tasks:
            t["project_name"] = p["name"]
        all_tasks.extend(tasks)

    from datetime import datetime as dt
    now_str = str(dt.utcnow().date())
    total_tasks = len(all_tasks)
    done_tasks = sum(1 for t in all_tasks if t.get("status", "").lower() in ("completed", "done"))
    overdue_tasks = sum(1 for t in all_tasks
                        if t.get("due_date") and str(t["due_date"]) < now_str
                        and t.get("status", "").lower() not in ("completed", "done", "cancelled"))

    user_perf = []
    if user["role"] in ("manager", "administrator"):
        uid_set = set(t["assigned_to"] for t in all_tasks if t.get("assigned_to"))
        for uid in uid_set:
            u_row = q_single(
                supabase.table("users").select("id,full_name,email,departments").eq("id", uid)
            )
            if not u_row:
                continue
            u_tasks = [t for t in all_tasks if t.get("assigned_to") == uid]
            u_done = sum(1 for t in u_tasks if t.get("status", "").lower() in ("completed", "done"))
            user_perf.append({
                "user": u_row,
                "assigned": len(u_tasks),
                "completed": u_done,
                "completion_rate": round(u_done / len(u_tasks) * 100) if u_tasks else 0,
            })
        user_perf.sort(key=lambda x: x["completion_rate"], reverse=True)

    return jsonify({
        "total_projects": len(my_projects),
        "active_projects": sum(1 for p in my_projects if p.get("status") == "active"),
        "total_tasks": total_tasks,
        "completed_tasks": done_tasks,
        "overdue_tasks": overdue_tasks,
        "overall_completion_rate": round(done_tasks / total_tasks * 100) if total_tasks else 0,
        "user_performance": user_perf,
    })


# ── Audit Log ─────────────────────────────────────────────────────────────────

@projects_bp.route("/<project_id>/audit", methods=["GET"])
@jwt_required()
@require_approved()
def project_audit(project_id):
    user_id = get_jwt_identity()
    user = get_current_user()
    if user["role"] != "administrator":
        return jsonify({"error": "Admins only"}), 403
    logs = supabase.table("project_audit_log").select(
        "*, user:user_id(full_name)"
    ).eq("project_id", project_id).order("created_at", desc=True).limit(100).execute()
    return jsonify(logs.data)


def _audit(project_id, user_id, action, details=""):
    try:
        supabase.table("project_audit_log").insert({
            "project_id": project_id, "user_id": user_id,
            "action": action, "details": details,
        }).execute()
    except Exception:
        pass
