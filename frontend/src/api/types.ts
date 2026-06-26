// TypeScript mirrors of the ShortlyX backend Pydantic schemas (app/schemas/*).
// Datetimes arrive as ISO-8601 strings over the wire.

// --- Auth / users ---
export interface UserRead {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
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
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
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

export interface LinkStats {
  link_id: string;
  code: string;
  total_clicks: number;
  unique_ip_estimate: number;
  last_clicked_at: string | null;
  created_at: string;
  timeseries: TimeBucket[];
  top_referrers: ReferrerCount[];
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
