import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

type UserForm = {
  username: string;
  displayName: string;
  password: string;
  isActive: boolean;
  roleCodes: string[];
  warehouseIds: string[];
  departmentIds: string[];
};

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Access Control Management</p>
        <h2>Create users, assign roles, and control warehouse or department scope</h2>
      </div>
      <button class="secondary-button" type="button" [disabled]="loading || submitting" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
    </section>

    <div class="inline-status success" *ngIf="message">{{ message }}</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="metric-grid">
      <article class="panel metric-card">
        <p class="eyebrow">Users</p>
        <strong>{{ users().length }}</strong>
        <span>Accounts in the local directory</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Locked</p>
        <strong>{{ lockedCount() }}</strong>
        <span>Accounts awaiting unlock or timeout</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Roles</p>
        <strong>{{ roles.length }}</strong>
        <span>Assignable security roles</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Warehouses</p>
        <strong>{{ warehouses.length }}</strong>
        <span>Assignable warehouse scopes</span>
      </article>
    </section>

    <section class="two-column layout-tight">
      <article class="panel">
        <div class="section-title">
          <h3>Directory</h3>
          <span class="pill">{{ filteredUsers().length }}</span>
        </div>
        <div class="filter-strip">
          <input class="form-input" [(ngModel)]="query" placeholder="Search users, roles, warehouses, or departments" />
          <button class="secondary-button" type="button" [disabled]="loading || submitting" (click)="startCreate()">New user</button>
        </div>

        <div class="tree-children">
          <button class="tree-node"
                  type="button"
                  *ngFor="let user of filteredUsers()"
                  [class.active]="selectedUser?.id === user.id && !isCreating"
                  (click)="selectUser(user)">
            <div class="section-title">
              <div>
                <strong>{{ user.display_name }}</strong>
                <p>{{ user.username }}</p>
              </div>
              <span class="pill" [class.pill-warning]="user.locked_until">{{ user.locked_until ? 'locked' : 'active' }}</span>
            </div>
            <p class="supporting">{{ user.roles.join(', ') || 'no role assigned' }}</p>
          </button>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <div>
            <h3>{{ isCreating ? 'Create user' : (selectedUser?.display_name || 'Access profile') }}</h3>
            <p class="supporting catalog-section-gap">{{ isCreating ? 'Administrator workflow' : (selectedUser?.username || 'Select a user to edit access') }}</p>
          </div>
          <div class="button-row">
            <button class="secondary-button" type="button" *ngIf="!isCreating && selectedUser?.locked_until" [disabled]="submitting" (click)="unlock(selectedUser.id)">Unlock</button>
            <button class="secondary-button" type="button" [disabled]="submitting" (click)="resetForm()">Reset</button>
          </div>
        </div>

        <div class="detail-grid">
          <label>
            <span>Username</span>
            <input class="form-input" [(ngModel)]="form.username" placeholder="local.username" />
          </label>
          <label>
            <span>Display name</span>
            <input class="form-input" [(ngModel)]="form.displayName" placeholder="Operator name" />
          </label>
          <label>
            <span>Password {{ isCreating ? '' : '(optional reset)' }}</span>
            <input class="form-input" type="password" [(ngModel)]="form.password" placeholder="{{ isCreating ? 'Required' : 'Leave blank to keep current' }}" />
          </label>
          <label>
            <span>Status</span>
            <select class="form-input" [(ngModel)]="form.isActive">
              <option [ngValue]="true">active</option>
              <option [ngValue]="false">disabled</option>
            </select>
          </label>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Roles</h3>
          <span class="pill">{{ form.roleCodes.length }} assigned</span>
        </div>
        <div class="checkbox-grid">
          <label class="checkbox-card" *ngFor="let role of roles">
            <input type="checkbox" [checked]="form.roleCodes.includes(role.code)" (change)="toggleSelection(form.roleCodes, role.code, $event)" />
            <div>
              <strong>{{ role.name }}</strong>
              <p>{{ role.code }}</p>
            </div>
          </label>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Warehouse scope</h3>
          <span class="pill">{{ form.warehouseIds.length }} assigned</span>
        </div>
        <div class="checkbox-grid">
          <label class="checkbox-card" *ngFor="let warehouse of warehouses">
            <input type="checkbox" [checked]="form.warehouseIds.includes(warehouse.id)" (change)="toggleSelection(form.warehouseIds, warehouse.id, $event)" />
            <div>
              <strong>{{ warehouse.name }}</strong>
              <p>{{ warehouse.code }}</p>
            </div>
          </label>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Department scope</h3>
          <span class="pill">{{ form.departmentIds.length }} assigned</span>
        </div>
        <div class="checkbox-grid">
          <label class="checkbox-card" *ngFor="let department of departments">
            <input type="checkbox" [checked]="form.departmentIds.includes(department.id)" (change)="toggleSelection(form.departmentIds, department.id, $event)" />
            <div>
              <strong>{{ department.name }}</strong>
              <p>{{ department.code }}</p>
            </div>
          </label>
        </div>

        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" [disabled]="loading || submitting" (click)="saveUser()">{{ submitting ? 'Saving...' : (isCreating ? 'Create user' : 'Save user') }}</button>
          <button class="secondary-button" type="button" *ngIf="!isCreating && selectedUser" [disabled]="loading || submitting" (click)="saveAccessControl()">Save access control</button>
        </div>
      </article>
    </section>
  `
})
export class UsersPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly users = signal<any[]>([]);
  readonly filteredUsers = computed(() => {
    const needle = this.query.trim().toLowerCase();
    if (!needle) {
      return this.users();
    }

    return this.users().filter((user) =>
      [
        user.display_name,
        user.username,
        ...(user.roles || []),
        ...(user.warehouses || []),
        ...(user.departments || [])
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  });

  query = '';
  selectedUser: any = null;
  isCreating = false;
  message = '';
  errorMessage = '';
  loading = false;
  submitting = false;

  roles: any[] = [];
  warehouses: any[] = [];
  departments: any[] = [];

  form: UserForm = this.emptyForm();

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.errorMessage = '';
      const [users, options] = await Promise.all([
        this.api.users(),
        this.api.accessControlOptions()
      ]);
      this.users.set(users);
      this.roles = options.roles;
      this.warehouses = options.warehouses;
      this.departments = options.departments;

      if (!this.isCreating) {
        const nextUser = users.find((user) => user.id === this.selectedUser?.id) ?? users[0] ?? null;
        if (nextUser) {
          this.selectUser(nextUser);
        }
      }
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.loading = false;
    }
  }

  startCreate() {
    this.isCreating = true;
    this.selectedUser = null;
    this.form = this.emptyForm();
    this.message = '';
    this.errorMessage = '';
  }

  selectUser(user: any) {
    this.isCreating = false;
    this.selectedUser = user;
    this.form = {
      username: user.username,
      displayName: user.display_name,
      password: '',
      isActive: Boolean(user.is_active),
      roleCodes: [...(user.roles ?? [])],
      warehouseIds: [...(user.warehouse_ids ?? [])],
      departmentIds: [...(user.department_ids ?? [])]
    };
    this.message = '';
    this.errorMessage = '';
  }

  resetForm() {
    if (this.isCreating) {
      this.form = this.emptyForm();
      return;
    }

    if (this.selectedUser) {
      this.selectUser(this.selectedUser);
    }
  }

  async saveUser() {
    if (this.submitting) {
      return;
    }
    try {
      this.submitting = true;
      this.errorMessage = '';
      if (this.isCreating) {
        await this.api.createUser(this.form);
        this.message = 'User created.';
      } else if (this.selectedUser) {
        await this.api.updateUser(this.selectedUser.id, {
          username: this.form.username,
          displayName: this.form.displayName,
          isActive: this.form.isActive,
          password: this.form.password || undefined
        });
        await this.api.updateUserAccessControl(this.selectedUser.id, {
          roleCodes: this.form.roleCodes,
          warehouseIds: this.form.warehouseIds,
          departmentIds: this.form.departmentIds
        });
        this.message = 'User and access control updated.';
      }

      await this.reload();
      if (this.isCreating) {
        this.isCreating = false;
      }
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async saveAccessControl() {
    if (!this.selectedUser || this.submitting) {
      return;
    }

    try {
      this.submitting = true;
      await this.api.updateUserAccessControl(this.selectedUser.id, {
        roleCodes: this.form.roleCodes,
        warehouseIds: this.form.warehouseIds,
        departmentIds: this.form.departmentIds
      });
      this.message = 'Access control updated.';
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async unlock(userId: string) {
    if (this.submitting) {
      return;
    }
    try {
      this.submitting = true;
      await this.api.unlockUser(userId);
      this.message = 'User unlocked.';
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  toggleSelection(collection: string[], value: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(collection);

    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }

    const values = [...next];

    if (collection === this.form.roleCodes) {
      this.form.roleCodes = values;
    } else if (collection === this.form.warehouseIds) {
      this.form.warehouseIds = values;
    } else {
      this.form.departmentIds = values;
    }
  }

  lockedCount() {
    return this.users().filter((user) => Boolean(user.locked_until)).length;
  }

  private emptyForm(): UserForm {
    return {
      username: '',
      displayName: '',
      password: '',
      isActive: true,
      roleCodes: [],
      warehouseIds: [],
      departmentIds: []
    };
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Access control action failed';
    }

    return 'Access control action failed';
  }
}
