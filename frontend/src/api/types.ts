// TypeScript mirrors of the ShortlyX backend Pydantic schemas (app/schemas/*).
// Datetimes arrive as ISO-8601 strings over the wire.

// --- Auth / users ---
export interface UserRead {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  email_verified: boolean;
  theme: string;
  accent: string;
  created_at: string;
}

export interface UserCreate {
  email: string;
  password: string;
  display_name?: string | null;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserUpdate {
  display_name?: string | null;
  password?: string | null;
  // Required by the backend whenever `password` is set.
  current_password?: string | null;
  theme?: "light" | "dark" | "system" | null;
  // Preset key ("blue") or a "#rrggbb" hex.
  accent?: string | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface SessionRead {
  jti: string;
  created_at: string | null;
  refreshed_at: string | null;
  user_agent: string | null;
}

// --- Links ---
export interface LinkRead {
  id: string;
  code: string;
  short_url: string;
  target_url: string;
  owner_id: string | null;
  is_custom_alias: boolean;
  is_active: boolean;
  has_password: boolean;
  expires_at: string | null;
  click_count: number;
  last_clicked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkCreate {
  target_url: string;
  custom_alias?: string | null;
  expires_at?: string | null;
  password?: string | null;
}

export interface LinkUpdate {
  target_url?: string | null;
  is_active?: boolean | null;
  // "" removes the password, a value sets it, undefined leaves it unchanged.
  expires_at?: string | null;
  password?: string | null;
}

// --- Analytics ---
export interface ClickRead {
  id: string;
  link_id: string;
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
}

export interface TimeBucket {
  bucket: string;
  count: number;
}

export interface ReferrerCount {
  referrer: string | null;
  count: number;
}

export interface CountryCount {
  country: string;
  count: number;
}

export interface LinkStats {
  link_id: string;
  code: string;
  total_clicks: number;
  unique_ip_estimate: number;
  last_clicked_at: string | null;
  created_at: string;
  timeseries: TimeBucket[];
  top_referrers: ReferrerCount[];
  top_countries: CountryCount[];
}

// --- Admin ---
export interface AdminUserRead {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  email_verified: boolean;
  link_count: number;
  created_at: string;
}

export interface AdminUserUpdate {
  is_active: boolean;
  disable_links?: boolean;
}

export interface AdminLinkRead extends LinkRead {
  owner_email: string | null;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  total_links: number;
  active_links: number;
  total_clicks: number;
  clicks_last_24h: number;
  new_users_last_7d: number;
  new_links_last_7d: number;
  clicks_per_day: TimeBucket[];
}

export interface AuditRead {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  detail: string | null;
  created_at: string;
}

// --- Shared ---
export interface Page<T> {
  items: T[];
  total: number | null;
  limit: number;
  offset: number;
  next_cursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field: string | null;
  };
  request_id: string | null;
}
