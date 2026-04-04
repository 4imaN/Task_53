import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '../core/auth/session.store';

type NavItem = { label: string; path: string; roles: string[]; badge?: string };
type TopbarSuggestion = { label: string; hint: string; path: string; query?: string; keywords?: string[] };

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell" [class.shell-nav-open]="navOpen()">
      <button class="shell-backdrop" type="button" [class.visible]="navOpen()" (click)="closeNav()" aria-label="Close navigation"></button>

      <aside class="sidebar panel panel-glass" [class.sidebar-open]="navOpen()">
        <div class="brand-block">
          <div>
            <p class="eyebrow">Offline District Ops</p>
            <h1>OmniStock</h1>
            <p class="sidebar-copy">Warehouse, catalog, and compliance workflows for closed local networks.</p>
          </div>
          <button class="secondary-button mobile-close-button" type="button" (click)="closeNav()">Close</button>
          <a *ngIf="showQuickScan()" class="scan-cta" routerLink="/inventory" (click)="closeNav()">Quick Scan</a>
        </div>

        <nav class="nav-list">
          <a *ngFor="let item of visibleNav()"
             [routerLink]="item.path"
             routerLinkActive="active-link"
             class="nav-link"
             (click)="closeNav()">
            <span>
              <strong>{{ item.label }}</strong>
              <small>{{ navHint(item.path) }}</small>
            </span>
            <small *ngIf="item.badge">{{ item.badge }}</small>
          </a>
        </nav>

        <section class="sidebar-footer panel panel-muted">
          <p class="eyebrow">Signed In</p>
          <div class="user-card">
            <div class="avatar">{{ initials() }}</div>
            <div>
              <strong>{{ session.user()?.displayName }}</strong>
              <p>{{ session.user()?.primaryRole }}</p>
            </div>
          </div>
          <div class="sidebar-meta">
            <div>
              <span>Warehouses</span>
              <strong>{{ assignedWarehouseCount() }}</strong>
            </div>
            <div>
              <span>Access</span>
              <strong>{{ visibleNav().length }} views</strong>
            </div>
          </div>
          <button class="secondary-button sidebar-logout" type="button" (click)="logout()">Sign Out</button>
        </section>
      </aside>

      <main class="workspace">
        <header class="topbar panel panel-glass">
          <div class="topbar-primary">
            <button class="secondary-button mobile-nav-toggle" type="button" (click)="toggleNav()">Menu</button>
            <div class="topbar-search">
              <p class="eyebrow">{{ workspaceEyebrow() }}</p>
              <form class="topbar-search-row" (submit)="submitTopbarSearch($event)">
                <input
                  class="searchbar"
                  [(ngModel)]="topbarSearch"
                  data-testid="topbar-command-input"
                  aria-label="Workspace command search"
                  name="topbarSearch"
                  placeholder="Search by item, barcode, lot, warehouse, or document status" />
                <button class="secondary-button topbar-search-button" data-testid="topbar-command-submit" type="submit">Search</button>
              </form>
              <div class="topbar-search-suggestions" *ngIf="topbarSuggestions().length">
                <button
                  *ngFor="let suggestion of topbarSuggestions()"
                  class="topbar-suggestion"
                  [attr.data-testid]="'topbar-suggestion-' + suggestion.path.replaceAll('/', '-')"
                  type="button"
                  (click)="activateTopbarSuggestion(suggestion)">
                  <span>
                    <strong>{{ suggestion.label }}</strong>
                    <small>{{ suggestion.hint }}</small>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div class="topbar-actions">
            <div class="topbar-summary">
              <span>{{ session.user()?.displayName }}</span>
              <small>{{ session.user()?.primaryRole }}</small>
            </div>
            <a
              *ngFor="let link of quickLinks()"
              [routerLink]="link.path"
              routerLinkActive="topbar-link-pill-active"
              [attr.data-testid]="'topbar-link-' + link.label.toLowerCase().replaceAll(' ', '-')"
              class="secondary-button topbar-link-pill">
              {{ link.label }}
            </a>
          </div>
        </header>

        <section class="page-slot">
          <router-outlet />
        </section>
      </main>
    </div>
  `
})
export class ShellLayoutComponent {
  readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  readonly navOpen = signal(false);
  topbarSearch = '';
  readonly navItemsByRole: Record<string, NavItem[]> = {
    administrator: [
      { label: 'Global Search', path: '/search', roles: ['administrator'] },
      { label: 'User Management', path: '/users', roles: ['administrator'], badge: 'Access' },
      { label: 'Roles & Rules', path: '/admin', roles: ['administrator'], badge: 'RBAC' },
      { label: 'Security & Sessions', path: '/profile', roles: ['administrator'] },
      { label: 'Audit Log Viewer', path: '/audit', roles: ['administrator'], badge: 'Immutable' },
      { label: 'Inbox', path: '/inbox', roles: ['administrator'] }
    ],
    manager: [
      { label: 'Search & Saved Views', path: '/search', roles: ['manager'] },
      { label: 'Metrics & Compliance', path: '/dashboard', roles: ['manager'] },
      { label: 'Warehouse Overview', path: '/warehouse', roles: ['manager'] },
      { label: 'Bulk Import / Export', path: '/bulk', roles: ['manager'] },
      { label: 'Inbox', path: '/inbox', roles: ['manager'] },
      { label: 'Profile', path: '/profile', roles: ['manager'] }
    ],
    moderator: [
      { label: 'Department Search', path: '/search', roles: ['moderator'] },
      { label: 'Abuse Report Queue', path: '/moderation', roles: ['moderator'], badge: 'Cases' },
      { label: 'Inbox', path: '/inbox', roles: ['moderator'] },
      { label: 'Profile', path: '/profile', roles: ['moderator'] }
    ],
    catalog_editor: [
      { label: 'Department Search & Saved Views', path: '/search', roles: ['catalog_editor'] },
      { label: 'Catalog Content', path: '/catalog', roles: ['catalog_editor'] },
      { label: 'Bulk Catalog I/O', path: '/bulk', roles: ['catalog_editor'] },
      { label: 'Inbox', path: '/inbox', roles: ['catalog_editor'] },
      { label: 'Profile', path: '/profile', roles: ['catalog_editor'] }
    ],
    warehouse_clerk: [
      { label: 'Warehouse Search & Saved Views', path: '/search', roles: ['warehouse_clerk'] },
      { label: 'Scan / Quick Action', path: '/inventory', roles: ['warehouse_clerk'], badge: 'Scan' },
      { label: 'Document Queue', path: '/documents', roles: ['warehouse_clerk'] },
      { label: 'Catalog', path: '/catalog', roles: ['warehouse_clerk'] },
      { label: 'Inbox', path: '/inbox', roles: ['warehouse_clerk'] },
      { label: 'Profile', path: '/profile', roles: ['warehouse_clerk'] }
    ]
  };
  readonly workspaceItem = computed<NavItem>(() => {
    const role = this.session.user()?.primaryRole ?? 'warehouse_clerk';
    const map: Record<string, NavItem> = {
      administrator: { label: 'Admin Workspace', path: '/workspace/administrator', roles: ['administrator'], badge: 'Home' },
      manager: { label: 'Manager Workspace', path: '/workspace/manager', roles: ['manager'], badge: 'Home' },
      moderator: { label: 'Moderator Workspace', path: '/workspace/moderator', roles: ['moderator'], badge: 'Home' },
      catalog_editor: { label: 'Catalog Workspace', path: '/workspace/catalog-editor', roles: ['catalog_editor'], badge: 'Home' },
      warehouse_clerk: { label: 'Clerk Workspace', path: '/workspace/warehouse-clerk', roles: ['warehouse_clerk'], badge: 'Home' }
    };

    return map[role];
  });

  readonly visibleNav = computed(() => {
    const role = this.session.user()?.primaryRole ?? 'warehouse_clerk';
    return [this.workspaceItem(), ...(this.navItemsByRole[role] ?? [])];
  });

  readonly quickLinks = computed(() => {
    const role = this.session.user()?.primaryRole ?? 'warehouse_clerk';
    const map: Record<string, Array<{ label: string; path: string }>> = {
      administrator: [
        { label: 'Users', path: '/users' },
        { label: 'Audit', path: '/audit' }
      ],
      manager: [
        { label: 'Documents', path: '/documents' },
        { label: 'Warehouse', path: '/warehouse' }
      ],
      moderator: [
        { label: 'Queue', path: '/moderation' },
        { label: 'Inbox', path: '/inbox' }
      ],
      catalog_editor: [
        { label: 'Catalog', path: '/catalog' },
        { label: 'Bulk', path: '/bulk' }
      ],
      warehouse_clerk: [
        { label: 'Inventory', path: '/inventory' },
        { label: 'Documents', path: '/documents' }
      ]
    };

    return map[role];
  });

  initials() {
    return this.session.user()?.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) ?? 'OS';
  }

  assignedWarehouseCount() {
    const user = this.session.user();
    if (!user) {
      return '0';
    }

    return user.roleCodes.some((role) => role === 'administrator' || role === 'manager')
      ? 'all'
      : String(user.assignedWarehouseIds.length);
  }

  navHint(path: string) {
    const hints: Record<string, string> = {
      '/workspace/administrator': 'access and governance',
      '/workspace/manager': 'throughput and approval',
      '/workspace/moderator': 'case triage and inbox',
      '/workspace/catalog-editor': 'content and imports',
      '/workspace/warehouse-clerk': 'scan and execute',
      '/dashboard': 'throughput and compliance',
      '/search': 'cross-record lookup and saved views',
      '/inventory': 'warehouse work execution',
      '/documents': 'assigned queue and execution',
      '/warehouse': 'zones and bins',
      '/catalog': 'item content and feedback',
      '/moderation': 'report handling and resolution',
      '/bulk': 'CSV and XLSX jobs',
      '/users': 'accounts and scope',
      '/audit': 'immutable security events',
      '/admin': 'roles, rules, and security',
      '/profile': 'identity, password, and sessions',
      '/inbox': 'status updates'
    };

    return hints[path] ?? 'workspace';
  }

  workspaceEyebrow() {
    const role = this.session.user()?.primaryRole ?? 'warehouse_clerk';
    const map: Record<string, string> = {
      administrator: 'Administrative Command',
      manager: 'Operations Command',
      moderator: 'Moderation Command',
      catalog_editor: 'Catalog Command',
      warehouse_clerk: 'Clerk Command'
    };

    return map[role];
  }

  showQuickScan() {
    return this.session.hasAnyRole(['administrator', 'manager', 'warehouse_clerk']);
  }

  toggleNav() {
    this.navOpen.update((open) => !open);
  }

  closeNav() {
    this.navOpen.set(false);
  }

  async submitTopbarSearch(event?: Event) {
    event?.preventDefault();
    const query = this.topbarSearch.trim();
    if (!query) {
      return;
    }

    const exactCommand = this.commandSuggestions().find((entry) => {
      const normalized = query.toLowerCase();
      return entry.label.toLowerCase() === normalized
        || entry.keywords?.some((keyword) => keyword === normalized);
    });

    if (exactCommand) {
      await this.activateTopbarSuggestion(exactCommand);
      return;
    }

    await this.router.navigate(['/search'], {
      queryParams: { item: query }
    });
    this.closeNav();
  }

  topbarSuggestions(): TopbarSuggestion[] {
    const query = this.topbarSearch.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const querySuggestion: TopbarSuggestion = {
      label: `Search records for "${this.topbarSearch.trim()}"`,
      hint: 'item, barcode, lot, warehouse, or document status',
      path: '/search',
      query: this.topbarSearch.trim()
    };

    const commandMatches = this.commandSuggestions()
      .filter((entry) => {
        const haystack = [entry.label, entry.hint, ...(entry.keywords ?? [])].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 4);

    return [querySuggestion, ...commandMatches];
  }

  async activateTopbarSuggestion(suggestion: TopbarSuggestion) {
    if (suggestion.query) {
      this.topbarSearch = suggestion.query;
      await this.submitTopbarSearch();
      return;
    }

    await this.router.navigateByUrl(suggestion.path);
    this.closeNav();
  }

  private commandSuggestions(): TopbarSuggestion[] {
    const quickLinks = this.quickLinks();
    const combined = [...this.visibleNav(), ...quickLinks.map((entry) => ({ ...entry, roles: [] } as NavItem))];

    return combined.map((entry) => ({
      label: entry.label,
      hint: this.navHint(entry.path),
      path: entry.path,
      keywords: this.commandKeywords(entry.path, entry.label)
    }));
  }

  private commandKeywords(path: string, label: string) {
    const base = label.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
    const byPath: Record<string, string[]> = {
      '/search': ['find', 'lookup', 'saved', 'views', 'global'],
      '/inventory': ['scan', 'barcode', 'receive', 'pick', 'move'],
      '/documents': ['queue', 'workflow', 'receiving', 'shipping', 'transfer'],
      '/catalog': ['items', 'reviews', 'questions', 'answers'],
      '/warehouse': ['zones', 'bins', 'setup'],
      '/moderation': ['reports', 'cases', 'abuse'],
      '/users': ['accounts', 'roles', 'access'],
      '/audit': ['log', 'events', 'security'],
      '/admin': ['rules', 'permissions', 'settings'],
      '/profile': ['password', 'sessions', 'account'],
      '/inbox': ['notifications', 'messages', 'updates']
    };

    return [...new Set([...base, ...(byPath[path] ?? [])])];
  }

  async logout() {
    await this.session.logout();
    this.closeNav();
  }
}
