import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { ActorKey, actorConfigs } from './actor-config';
import { describeCaptchaLoadFailure, describeLoginPrecheckFailure, describeLoginRequestFailure } from './login-error-utils';
import { svgToDataUrl } from './captcha-utils';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <section class="login-card panel panel-glass">
        <p class="eyebrow">Closed-Network Authentication</p>
        <h1>{{ currentActor.title }}</h1>
        <p class="supporting">{{ currentActor.subtitle }}</p>

        <div class="button-row catalog-section-gap">
          <span class="pill">Dedicated actor login</span>
        </div>

        <div class="inline-status success catalog-section-gap">
          <strong>Actor workspace</strong>
          <p>{{ currentActor.note }}</p>
        </div>

        <label class="field-label">Username</label>
        <input class="form-input" [(ngModel)]="username" (ngModelChange)="clearPreloginErrors()" (blur)="refreshHints()" placeholder="Enter username" />

        <label class="field-label">Password</label>
        <input class="form-input" [(ngModel)]="password" (ngModelChange)="authErrorMessage = ''" type="password" placeholder="Enter password" />

        <div class="inline-status" *ngIf="lockedUntil">Account locked until {{ lockedUntil }}</div>

        <div class="captcha-card panel panel-muted" *ngIf="captchaRequired">
          <div>
            <p class="eyebrow">Local CAPTCHA</p>
            <img class="captcha-image" *ngIf="captchaImageUrl" [src]="captchaImageUrl" alt="CAPTCHA challenge" />
          </div>
          <button type="button" class="secondary-button" (click)="loadCaptcha()">Refresh</button>
        </div>

        <ng-container *ngIf="captchaRequired">
          <label class="field-label">CAPTCHA Answer</label>
          <input class="form-input" [(ngModel)]="captchaAnswer" (ngModelChange)="captchaErrorMessage = ''" placeholder="Enter challenge text" />
        </ng-container>

        <div class="inline-status error-status" *ngIf="precheckErrorMessage">{{ precheckErrorMessage }}</div>
        <div class="inline-status error-status" *ngIf="captchaErrorMessage">{{ captchaErrorMessage }}</div>
        <div class="inline-status error-status" *ngIf="authErrorMessage">{{ authErrorMessage }}</div>
        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" (click)="submit()" [disabled]="session.loading()">
            {{ session.loading() ? 'Signing in...' : 'Enter Workspace' }}
          </button>
        </div>
      </section>
    </div>
  `
})
export class LoginPageComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly actorConfigs = actorConfigs;
  currentActor = actorConfigs[0];

  username = '';
  password = '';
  captchaAnswer = '';
  captchaId: string | undefined;
  captchaImageUrl = '';
  captchaRequired = false;
  lockedUntil: string | null = null;
  precheckErrorMessage = '';
  captchaErrorMessage = '';
  authErrorMessage = '';

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const actorKey = params.get('actor') as ActorKey | null;
      this.currentActor = actorConfigs.find((actor) => actor.key === actorKey) ?? actorConfigs[0];
      this.resetActorForm();
      void this.refreshHints();
    });
  }

  resetActorForm() {
    this.username = '';
    this.password = '';
    this.captchaAnswer = '';
    this.captchaId = undefined;
    this.captchaImageUrl = '';
    this.captchaRequired = false;
    this.lockedUntil = null;
    this.clearInlineErrors();
  }

  clearPreloginErrors() {
    this.precheckErrorMessage = '';
    this.captchaErrorMessage = '';
  }

  clearInlineErrors() {
    this.precheckErrorMessage = '';
    this.captchaErrorMessage = '';
    this.authErrorMessage = '';
  }

  async refreshHints() {
    const trimmedUsername = this.username.trim();
    if (!trimmedUsername) {
      this.clearPreloginErrors();
      this.captchaRequired = false;
      this.captchaAnswer = '';
      this.captchaId = undefined;
      this.captchaImageUrl = '';
      this.lockedUntil = null;
      return true;
    }

    this.precheckErrorMessage = '';
    try {
      const hints = await this.api.loginHints(trimmedUsername);
      this.captchaRequired = hints.captchaRequired;
      this.lockedUntil = hints.lockedUntil;

      if (!this.captchaRequired) {
        this.captchaAnswer = '';
        this.captchaId = undefined;
        this.captchaImageUrl = '';
        this.captchaErrorMessage = '';
        return true;
      }

      return this.loadCaptcha();
    } catch (error) {
      this.precheckErrorMessage = describeLoginPrecheckFailure(error);
      return false;
    }
  }

  async loadCaptcha() {
    const trimmedUsername = this.username.trim();
    if (!trimmedUsername) {
      this.captchaErrorMessage = 'Enter a username before requesting a CAPTCHA challenge.';
      return false;
    }

    const existingCaptchaId = this.captchaId;
    const existingCaptchaImageUrl = this.captchaImageUrl;
    this.captchaErrorMessage = '';

    try {
      const challenge = await this.api.captcha(trimmedUsername);
      this.captchaId = challenge.id;
      this.captchaImageUrl = svgToDataUrl(challenge.svg);
      return true;
    } catch (error) {
      this.captchaId = existingCaptchaId;
      this.captchaImageUrl = existingCaptchaImageUrl;
      this.captchaErrorMessage = describeCaptchaLoadFailure(error);
      return false;
    }
  }

  async submit() {
    this.authErrorMessage = '';

    const canAttemptLogin = await this.refreshHints();
    if (!canAttemptLogin) {
      return;
    }

    if (this.captchaRequired && !this.captchaId) {
      this.captchaErrorMessage = this.captchaErrorMessage || 'CAPTCHA load failed. Refresh the challenge and try again.';
      return;
    }

    try {
      await this.session.login({
        username: this.username.trim(),
        password: this.password,
        captchaId: this.captchaId,
        captchaAnswer: this.captchaAnswer,
        loginActor: this.currentActor.key
      });
      await this.router.navigateByUrl(this.session.homeUrl());
    } catch (error) {
      this.authErrorMessage = describeLoginRequestFailure(error);
    }
  }
}
