import { Routes } from '@angular/router';
import { ShellLayoutComponent } from './layouts/shell-layout.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { DashboardPageComponent } from './features/dashboard/dashboard-page.component';
import { SearchPageComponent } from './features/search/search-page.component';
import { InventoryPageComponent } from './features/inventory/inventory-page.component';
import { WarehousePageComponent } from './features/warehouse/warehouse-page.component';
import { CatalogPageComponent } from './features/catalog/catalog-page.component';
import { DocumentsPageComponent } from './features/documents/documents-page.component';
import { ModerationPageComponent } from './features/moderation/moderation-page.component';
import { BulkPageComponent } from './features/bulk/bulk-page.component';
import { AdminPageComponent } from './features/admin/admin-page.component';
import { InboxPageComponent } from './features/inbox/inbox-page.component';
import { ProfilePageComponent } from './features/profile/profile-page.component';
import { UsersPageComponent } from './features/users/users-page.component';
import { AuditPageComponent } from './features/audit/audit-page.component';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard, roleHomeGuard } from './core/auth/role.guard';
import { AdminWorkspacePageComponent } from './features/workspaces/admin-workspace-page.component';
import { ManagerWorkspacePageComponent } from './features/workspaces/manager-workspace-page.component';
import { ModeratorWorkspacePageComponent } from './features/workspaces/moderator-workspace-page.component';
import { CatalogWorkspacePageComponent } from './features/workspaces/catalog-workspace-page.component';
import { ClerkWorkspacePageComponent } from './features/workspaces/clerk-workspace-page.component';

export const routes: Routes = [
  { path: 'login', pathMatch: 'full', redirectTo: 'login/warehouse-clerk' },
  { path: 'login/:actor', component: LoginPageComponent },
  {
    path: '',
    component: ShellLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [roleHomeGuard], component: ProfilePageComponent },
      { path: 'workspace/administrator', component: AdminWorkspacePageComponent, canActivate: [roleGuard], data: { roles: ['administrator'] } },
      { path: 'workspace/manager', component: ManagerWorkspacePageComponent, canActivate: [roleGuard], data: { roles: ['manager'] } },
      { path: 'workspace/moderator', component: ModeratorWorkspacePageComponent, canActivate: [roleGuard], data: { roles: ['moderator'] } },
      { path: 'workspace/catalog-editor', component: CatalogWorkspacePageComponent, canActivate: [roleGuard], data: { roles: ['catalog_editor'] } },
      { path: 'workspace/warehouse-clerk', component: ClerkWorkspacePageComponent, canActivate: [roleGuard], data: { roles: ['warehouse_clerk'] } },
      { path: 'dashboard', component: DashboardPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager'] } },
      { path: 'search', component: SearchPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager', 'moderator', 'catalog_editor', 'warehouse_clerk'] } },
      {
        path: 'inventory',
        component: InventoryPageComponent,
        canActivate: [roleGuard],
        data: {
          roles: ['administrator', 'manager', 'warehouse_clerk'],
          permissionsAny: ['inventory.scan', 'inventory.receive', 'inventory.move', 'inventory.pick']
        }
      },
      {
        path: 'documents',
        component: DocumentsPageComponent,
        canActivate: [roleGuard],
        data: {
          roles: ['administrator', 'manager', 'warehouse_clerk'],
          permissionsAny: ['inventory.receive', 'inventory.pick', 'inventory.move', 'inventory.count', 'inventory.adjust', 'documents.approve']
        }
      },
      { path: 'warehouse', component: WarehousePageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager'] } },
      { path: 'catalog', component: CatalogPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager', 'moderator', 'catalog_editor', 'warehouse_clerk'] } },
      { path: 'moderation', component: ModerationPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'moderator'] } },
      { path: 'bulk', component: BulkPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager', 'catalog_editor'] } },
      { path: 'admin', component: AdminPageComponent, canActivate: [roleGuard], data: { roles: ['administrator'] } },
      { path: 'users', component: UsersPageComponent, canActivate: [roleGuard], data: { roles: ['administrator'] } },
      { path: 'audit', component: AuditPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager'] } },
      { path: 'profile', component: ProfilePageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager', 'moderator', 'catalog_editor', 'warehouse_clerk'] } },
      { path: 'inbox', component: InboxPageComponent, canActivate: [roleGuard], data: { roles: ['administrator', 'manager', 'moderator', 'catalog_editor', 'warehouse_clerk'] } }
    ]
  },
  { path: '**', redirectTo: '' }
];
