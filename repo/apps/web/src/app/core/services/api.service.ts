import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AuthSession = {
  sub: string;
  sid: string;
  username: string;
  displayName: string;
  roleCodes: string[];
  permissionCodes: string[];
  assignedWarehouseIds: string[];
  departmentIds: string[];
};

export type LoginHints = {
  captchaRequired: boolean;
  lockedUntil: string | null;
};

export type CaptchaChallenge = {
  id: string;
  svg: string;
  expiresAt: string;
};

export type SessionInfo = {
  token_id: string;
  rotation_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type MetricSummaryRow = {
  metric_type: string;
  metric_value: number | string;
  warehouse_id: string | null;
  period_end: string;
};

export type InboxMessage = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type AuditEntry = {
  timestamp: string;
  action_type: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_id: string | null;
};

export type InventoryScanItem = {
  item_id: string;
  item_name: string;
  sku: string;
  barcode: string | null;
  temperature_band: string;
  weight_lbs: string;
  length_in: string;
  width_in: string;
  height_in: string;
};

export type InventoryScanWarehouseOption = {
  warehouse_id: string;
  warehouse_name: string;
};

export type InventoryScanLotMatch = InventoryScanItem & {
  lot_id: string;
  lot_code: string;
  quantity_on_hand: string;
  warehouse_id: string;
  warehouse_name: string;
  bin_id: string;
  bin_code: string;
  bin_quantity: string;
};

export type InventoryScanResult =
  | {
    kind: 'no_match';
    code: string;
    message: string;
  }
  | {
    kind: 'item_only';
    code: string;
    item: InventoryScanItem;
    receiving_warehouses: InventoryScanWarehouseOption[];
  }
  | {
    kind: 'single_position';
    code: string;
    match: InventoryScanLotMatch;
  }
  | {
    kind: 'multiple_positions';
    code: string;
    matches: InventoryScanLotMatch[];
  };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api';

  login(payload: {
    username: string;
    password: string;
    captchaId?: string;
    captchaAnswer?: string;
    loginActor?: 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';
  }) {
    return firstValueFrom(this.http.post<{ token: string; user: AuthSession }>(`${this.apiBase}/auth/login`, payload, { withCredentials: true }));
  }

  logout() {
    return firstValueFrom(this.http.post<{ success: boolean }>(`${this.apiBase}/auth/logout`, {}, { withCredentials: true }));
  }

  me() {
    return firstValueFrom(this.http.get<AuthSession>(`${this.apiBase}/auth/me`, { withCredentials: true }));
  }

  rotateSession() {
    return firstValueFrom(this.http.post<{ token: string; user: AuthSession }>(`${this.apiBase}/auth/sessions/rotate`, {}, { withCredentials: true }));
  }

  loginHints(username: string) {
    const params = new HttpParams().set('username', username);
    return firstValueFrom(this.http.get<LoginHints>(`${this.apiBase}/auth/login-hints`, { params, withCredentials: true }));
  }

  captcha(username: string) {
    const params = new HttpParams().set('username', username);
    return firstValueFrom(this.http.get<CaptchaChallenge>(`${this.apiBase}/auth/captcha`, { params, withCredentials: true }));
  }

  sessions() {
    return firstValueFrom(this.http.get<SessionInfo[]>(`${this.apiBase}/auth/sessions`, { withCredentials: true }));
  }

  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return firstValueFrom(this.http.post<{ success: boolean }>(`${this.apiBase}/auth/change-password`, payload, { withCredentials: true }));
  }

  revokeSession(sessionId: string) {
    return firstValueFrom(this.http.post<{ success: boolean }>(`${this.apiBase}/auth/sessions/${sessionId}/revoke`, {}, { withCredentials: true }));
  }

  metrics() {
    return firstValueFrom(this.http.get<MetricSummaryRow[]>(`${this.apiBase}/metrics/summary`, { withCredentials: true }));
  }

  search(filters: Record<string, string | number | undefined>) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return firstValueFrom(this.http.get<any>(`${this.apiBase}/search`, { params, withCredentials: true }));
  }

  savedViews() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/search/views`, { withCredentials: true }));
  }

  saveView(viewName: string, filters: Record<string, unknown>) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/search/views`, { viewName, filters }, { withCredentials: true }));
  }

  warehouseSetupOptions() {
    return firstValueFrom(this.http.get<{ departments: any[]; temperatureBands: string[] }>(`${this.apiBase}/warehouse-setup/options`, { withCredentials: true }));
  }

  warehouses() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/warehouses`, { withCredentials: true }));
  }

  createWarehouse(payload: { departmentId: string; code: string; name: string; address?: string; isActive?: boolean }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/warehouses`, payload, { withCredentials: true }));
  }

  updateWarehouse(warehouseId: string, payload: { departmentId?: string; code?: string; name?: string; address?: string; isActive?: boolean }) {
    return firstValueFrom(this.http.patch<any>(`${this.apiBase}/warehouses/${warehouseId}`, payload, { withCredentials: true }));
  }

  warehouseTree(warehouseId: string) {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/warehouses/${warehouseId}/tree`, { withCredentials: true }));
  }

  createZone(warehouseId: string, payload: { code: string; name: string }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/warehouses/${warehouseId}/zones`, payload, { withCredentials: true }));
  }

  updateZone(zoneId: string, payload: { code?: string; name?: string }) {
    return firstValueFrom(this.http.patch<any>(`${this.apiBase}/zones/${zoneId}`, payload, { withCredentials: true }));
  }

  createBin(zoneId: string, payload: {
    code: string;
    temperatureBand: string;
    maxLoadLbs: number;
    maxLengthIn: number;
    maxWidthIn: number;
    maxHeightIn: number;
    isActive?: boolean;
    reason?: string;
  }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/zones/${zoneId}/bins`, payload, { withCredentials: true }));
  }

  updateBin(binId: string, payload: {
    code?: string;
    temperatureBand?: string;
    maxLoadLbs?: number;
    maxLengthIn?: number;
    maxWidthIn?: number;
    maxHeightIn?: number;
    isActive?: boolean;
    reason?: string;
  }) {
    return firstValueFrom(this.http.patch<any>(`${this.apiBase}/bins/${binId}`, payload, { withCredentials: true }));
  }

  binTimeline(binId: string) {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/bins/${binId}/timeline`, { withCredentials: true }));
  }

  toggleBin(binId: string, isActive: boolean, reason?: string) {
    return firstValueFrom(this.http.post(`${this.apiBase}/bins/${binId}/toggle`, { isActive, reason }, { withCredentials: true }));
  }

  inventoryScan(code: string) {
    return firstValueFrom(this.http.post<InventoryScanResult>(`${this.apiBase}/inventory/scan`, { code }, { withCredentials: true }));
  }

  receiveInventory(payload: {
    itemId: string;
    warehouseId: string;
    binId: string;
    lotCode: string;
    quantity: number;
    expirationDate?: string;
    documentId?: string;
  }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/inventory/receive`, payload, { withCredentials: true }));
  }

  moveInventory(payload: { lotId: string; sourceBinId: string; targetBinId: string; quantity: number }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/inventory/move`, payload, { withCredentials: true }));
  }

  pickInventory(payload: { lotId: string; binId: string; quantity: number }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/inventory/pick`, payload, { withCredentials: true }));
  }

  moderationQueue() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/moderation/queue`, { withCredentials: true }));
  }

  updateModerationStatus(reportId: string, payload: {
    reporterStatus: 'submitted' | 'under_review' | 'resolved' | 'dismissed';
    moderationStatus: 'new' | 'assigned' | 'investigating' | 'action_taken' | 'no_action' | 'escalated' | 'closed';
    internalNotes?: string;
  }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/moderation/reports/${reportId}/status`, payload, { withCredentials: true }));
  }

  inbox() {
    return firstValueFrom(this.http.get<InboxMessage[]>(`${this.apiBase}/inbox`, { withCredentials: true }));
  }

  markInboxItemRead(notificationId: string) {
    return firstValueFrom(this.http.post(`${this.apiBase}/inbox/${notificationId}/read`, {}, { withCredentials: true }));
  }

  markAllInboxRead() {
    return firstValueFrom(this.http.post(`${this.apiBase}/inbox/read-all`, {}, { withCredentials: true }));
  }

  catalogItems() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/catalog/items`, { withCredentials: true }));
  }

  catalogItem(itemId: string) {
    return firstValueFrom(this.http.get<any>(`${this.apiBase}/catalog/items/${itemId}`, { withCredentials: true }));
  }

  updateCatalogItem(itemId: string, payload: {
    name?: string;
    description?: string;
    unitOfMeasure?: string;
    temperatureBand?: string;
    weightLbs?: number;
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  }) {
    return firstValueFrom(this.http.patch<any>(`${this.apiBase}/catalog/items/${itemId}`, payload, { withCredentials: true }));
  }

  favoriteItem(itemId: string, favorite: boolean) {
    return firstValueFrom(this.http.post(`${this.apiBase}/catalog/items/${itemId}/favorite`, { favorite }, { withCredentials: true }));
  }

  upsertReview(itemId: string, payload: { rating: number; body: string }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/catalog/items/${itemId}/reviews`, payload, { withCredentials: true }));
  }

  createReviewFollowup(reviewId: string, payload: { body: string; ratingOverride?: number }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/catalog/reviews/${reviewId}/followups`, payload, { withCredentials: true }));
  }

  uploadReviewImage(reviewId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(this.http.post(`${this.apiBase}/catalog/reviews/${reviewId}/images`, formData, { withCredentials: true }));
  }

  createQuestion(itemId: string, payload: { question: string }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/catalog/items/${itemId}/questions`, payload, { withCredentials: true }));
  }

  createAnswer(questionId: string, payload: { body: string }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/catalog/questions/${questionId}/answers`, payload, { withCredentials: true }));
  }

  submitAbuseReport(payload: { targetType: string; targetId: string; reason: string }) {
    return firstValueFrom(this.http.post(`${this.apiBase}/moderation/reports`, payload, { withCredentials: true }));
  }

  users() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/users`, { withCredentials: true }));
  }

  accessControlOptions() {
    return firstValueFrom(this.http.get<{ roles: any[]; warehouses: any[]; departments: any[] }>(`${this.apiBase}/access-control/options`, { withCredentials: true }));
  }

  createUser(payload: {
    username: string;
    displayName: string;
    password: string;
    isActive?: boolean;
    roleCodes?: string[];
    warehouseIds?: string[];
    departmentIds?: string[];
  }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/users`, payload, { withCredentials: true }));
  }

  updateUser(userId: string, payload: {
    username?: string;
    displayName?: string;
    isActive?: boolean;
    password?: string;
  }) {
    return firstValueFrom(this.http.patch<any>(`${this.apiBase}/users/${userId}`, payload, { withCredentials: true }));
  }

  updateUserAccessControl(userId: string, payload: {
    roleCodes: string[];
    warehouseIds: string[];
    departmentIds: string[];
  }) {
    return firstValueFrom(this.http.put<any>(`${this.apiBase}/users/${userId}/access-control`, payload, { withCredentials: true }));
  }

  unlockUser(userId: string) {
    return firstValueFrom(this.http.post(`${this.apiBase}/users/${userId}/unlock`, {}, { withCredentials: true }));
  }

  auditLog(limit = 25) {
    const params = new HttpParams().set('limit', String(limit));
    return firstValueFrom(this.http.get<AuditEntry[]>(`${this.apiBase}/audit-log`, { params, withCredentials: true }));
  }

  documents(status?: string) {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/documents`, { params, withCredentials: true }));
  }

  document(documentId: string) {
    return firstValueFrom(this.http.get<any>(`${this.apiBase}/documents/${documentId}`, { withCredentials: true }));
  }

  createDocument(payload: { warehouseId: string; type: string; payload?: Record<string, unknown>; documentNumber?: string }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/documents`, payload, { withCredentials: true }));
  }

  transitionDocument(documentId: string, toStatus: string, notes?: string) {
    return firstValueFrom(this.http.post(`${this.apiBase}/documents/${documentId}/transition`, { toStatus, notes }, { withCredentials: true }));
  }

  executeReceivingDocument(documentId: string) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/documents/${documentId}/execute-receiving`, {}, { withCredentials: true }));
  }

  executeShippingDocument(documentId: string) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/documents/${documentId}/execute-shipping`, {}, { withCredentials: true }));
  }

  executeTransferDocument(documentId: string) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/documents/${documentId}/execute-transfer`, {}, { withCredentials: true }));
  }

  bulkTemplateCatalogItems(format: 'csv' | 'xlsx') {
    const params = new HttpParams().set('format', format);
    return firstValueFrom(this.http.get(`${this.apiBase}/bulk/templates/catalog-items`, { params, responseType: 'arraybuffer', withCredentials: true }));
  }

  bulkPrecheckCatalogItems(payload: { filename: string; contentBase64: string }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/bulk/catalog-items/precheck`, payload, { withCredentials: true }));
  }

  bulkImportCatalogItems(payload: { filename: string; contentBase64: string }) {
    return firstValueFrom(this.http.post<any>(`${this.apiBase}/bulk/catalog-items/import`, payload, { withCredentials: true }));
  }

  bulkExportCatalogItems(format: 'csv' | 'xlsx') {
    const params = new HttpParams().set('format', format);
    return firstValueFrom(this.http.get(`${this.apiBase}/bulk/catalog-items/export`, { params, responseType: 'arraybuffer', withCredentials: true }));
  }

  bulkJobs() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/bulk/jobs`, { withCredentials: true }));
  }

  bulkJobResults(jobId: string) {
    return firstValueFrom(this.http.get<any[]>(`${this.apiBase}/bulk/jobs/${jobId}/results`, { withCredentials: true }));
  }
}
