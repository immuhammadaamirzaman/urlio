import { api } from "./client";

// --- Interfaces ---

export interface CredentialListItem {
  id: string;
  detail: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialListResponse {
  items: CredentialListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CredentialCreateRequest {
  master_password: string;
  username_or_email: string;
  password: string;
  detail: string;
  url?: string | null;
}

export interface CredentialCreateResponse {
  id: string;
  detail: string;
  created_at: string;
}

export interface CredentialDecryptRequest {
  master_password: string;
}

export interface DecryptedCredential {
  id: string;
  username_or_email: string;
  password: string;
  detail: string;
  url: string | null;
}

export interface CredentialUpdateRequest {
  master_password: string;
  username_or_email?: string | null;
  password?: string | null;
  detail?: string | null;
  url?: string | null;
}

export interface CredentialUpdateResponse {
  id: string;
  detail: string;
  updated_at: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  id: string;
  updated_at: string;
}

export interface BulkDecryptRequest {
  master_password: string;
  credential_ids?: string[] | null;
}

export interface BulkDecryptFailure {
  id: string;
  error: string;
}

export interface BulkDecryptResponse {
  successes: DecryptedCredential[];
  failures: BulkDecryptFailure[];
  success_count: number;
  failure_count: number;
}

// --- API Functions ---

export function listCredentials(
  params: { limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<CredentialListResponse> {
  return api.get<CredentialListResponse>("/credentials", params, signal);
}

export function createCredential(
  data: CredentialCreateRequest,
): Promise<CredentialCreateResponse> {
  return api.post<CredentialCreateResponse>("/credentials", data);
}

export function decryptCredential(
  id: string,
  data: CredentialDecryptRequest,
): Promise<DecryptedCredential> {
  return api.post<DecryptedCredential>(`/credentials/${id}/decrypt`, data);
}

export function updateCredential(
  id: string,
  data: CredentialUpdateRequest,
): Promise<CredentialUpdateResponse> {
  return api.patch<CredentialUpdateResponse>(`/credentials/${id}`, data);
}

export function deleteCredential(id: string): Promise<void> {
  return api.del<void>(`/credentials/${id}`);
}

export function changeCredentialPassword(
  id: string,
  data: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  return api.post<ChangePasswordResponse>(`/credentials/${id}/change-password`, data);
}

export function bulkDecryptCredentials(
  data: BulkDecryptRequest,
): Promise<BulkDecryptResponse> {
  return api.post<BulkDecryptResponse>("/credentials/bulk-decrypt", data);
}
