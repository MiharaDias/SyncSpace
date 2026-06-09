from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import supabase
from app.utils.auth_helpers import require_approved, q_single
from datetime import datetime, timedelta
from dateutil import parser as dateparser

busy_bp = Blueprint("busy", __name__)


@busy_bp.route("/", methods=["GET"])
@jwt_required()
@require_approved()
def list_busy():
    user_id = get_jwt_identity()
    start = request.args.get("start")
    end = request.args.get("end")
    # URL query strings decode '+' as space; ISO timestamps use '+00:00' for UTC.
    # Restore the '+' so PostgreSQL receives a valid timestamptz string.
    if start:
        start = start.replace(" ", "+")
    if end:
        end = end.replace(" ", "+")

    q = supabase.table("busy_slots").select("*").eq("user_id", user_id)
    if start:
        q = q.gte("start_time", start)
    if end:
        q = q.lte("start_time", end)

    result = q.execute()
    return jsonify(result.data)


@busy_bp.route("/", methods=["POST"])
@jwt_required()
@require_approved()
def create_busy():
    user_id = get_jwt_identity()
    data = request.json or {}           # FIX M5

    if not data.get("start_time") or not data.get("end_time"):
        return jsonify({"error": "start_time and end_time required"}), 400

    # FIX M2: Length cap on reason field
    reason = str(data.get("reason", "Busy"))[:200]

    busy = {
        "user_id": user_id,
        "start_time": data["start_time"],
        "end_time": data["end_time"],
        "reason": reason,
        "is_all_day": data.get("is_all_day", False)
    }

    result = supabase.table("busy_slots").insert(busy).execute()
    return jsonify(result.data[0]), 201


@busy_bp.route("/<slot_id>", methods=["DELETE"])
@jwt_required()
@require_approved()
def delete_busy(slot_id):
    user_id = get_jwt_identity()
    res = q_single(supabase.table("busy_slots").select("user_id").eq("id", slot_id))
    if not res:
        return jsonify({"error": "Slot not found"}), 404
    if res["user_id"] != user_id:
        return jsonify({"error": "Not authorized"}), 403

    supabase.table("busy_slots").delete().eq("id", slot_id).execute()
    return jsonify({"message": "Deleted"})
