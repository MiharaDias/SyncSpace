export interface User {
  id: string;
  full_name: string;
  username: string;
  email: string;
  department: string;
  departments: string[];
  role: 'user' | 'manager' | 'administrator';
  is_approved: boolean;
  is_active: boolean;
  profile_picture?: string;
  google_id?: string;
  google_connected?: boolean;
  google_email?: string;
  created_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  purpose?: string;
  location?: string;
  organizer_id: string;
  organizer?: User;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  recurrence_type: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_end_date?: string;
  parent_meeting_id?: string;
  google_event_id?: string;
  status: 'active' | 'cancelled';
  created_at: string;
  attendees?: MeetingAttendee[];
  user_role?: 'organizer' | 'attendee';
  attendance_type?: 'required' | 'optional';
  response_status?: 'pending' | 'accepted' | 'rejected';
}

export interface MeetingAttendee {
  id: string;
  meeting_id: string;
  user_id: string;
  users?: User;
  attendance_type: 'required' | 'optional';
  response_status: 'pending' | 'accepted' | 'rejected';
  rejection_reason?: string;
  responded_at?: string;
}

export interface BusySlot {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  reason?: string;
  is_all_day: boolean;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  type: 'meeting' | 'busy';
  title: string;
  start: string;
  end: string;
  color: string;
  role?: 'organizer' | 'attendee';
  attendance_type?: 'required' | 'optional';
  response_status?: 'pending' | 'accepted' | 'rejected';
  is_all_day?: boolean;
  raw: Meeting | BusySlot;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  reference_id?: string;
  reference_type?: 'meeting' | 'task' | 'user' | 'project';
  is_read: boolean;
  created_at: string;
  meeting?: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    status: string;
    location?: string;
    my_response: 'pending' | 'accepted' | 'rejected';
  };
}

// ── Project Management ───────────────────────────────────────────────────────

export interface ProjectCustomStatus {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'member' | 'manager';
  added_by?: string;
  created_at: string;
  users?: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  creator?: User;
  start_date?: string;
  end_date?: string;
  status: 'active' | 'archived' | 'completed' | 'on_hold' | 'deleted';
  visibility: 'department' | 'users' | 'private';
  visibility_departments: string[];
  created_at: string;
  updated_at: string;
  // enriched
  total_tasks: number;
  completed_tasks: number;
  progress: number;
  member_count: number;
  members?: ProjectMember[];
}

export interface SubDeadline {
  id: string;
  task_id: string;
  title: string;
  due_date: string;
  is_completed: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  created_by: string;
  assigned_to?: string;
  assigned_user?: Pick<User, 'id' | 'full_name' | 'email' | 'profile_picture'>;
  creator?: Pick<User, 'id' | 'full_name'>;
  due_date?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;            // open string — supports custom statuses
  department?: string;
  project_id?: string;
  project?: Pick<Project, 'id' | 'name'>;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  completed_at?: string;
  created_at: string;
  updated_at: string;
  // enriched
  sub_deadlines?: SubDeadline[];
  sub_deadline_count?: number;
  sub_deadline_done?: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user?: Pick<User, 'id' | 'full_name' | 'profile_picture'>;
  content: string;
  created_at: string;
}

export interface TaskAuditLog {
  id: string;
  task_id: string;
  user_id: string;
  user?: Pick<User, 'id' | 'full_name'>;
  action: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface ConflictResult {
  has_conflicts: boolean;
  conflict_count: number;
  conflict_details: {
    user: User;
    conflicts: Array<{ type: string; title: string; start: string; end: string }>;
  }[];
}

export interface SuggestedSlot {
  start: string;
  end: string;
  date: string;
}
