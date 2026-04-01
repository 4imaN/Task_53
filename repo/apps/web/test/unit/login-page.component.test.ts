import test from 'node:test';
import assert from 'node:assert/strict';
import { BehaviorSubject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type ParamMap } from '@angular/router';
import { LoginPageComponent } from '../../src/app/features/auth/login-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

function buildRouteStub(actor = 'warehouse-clerk') {
  const params$ = new BehaviorSubject<ParamMap>(convertToParamMap({ actor }));
  return {
    snapshot: { queryParamMap: convertToParamMap({}), paramMap: params$.value },
    paramMap: params$.asObservable()
  };
}

function createLoginFixture(overrides?: Partial<ApiService>) {
  const routeStub = buildRouteStub();
  const apiStub = {
    loginHints: async () => ({ captchaRequired: false, lockedUntil: null }),
    captcha: async () => ({ id: 'captcha-1', svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>AB12</text></svg>', expiresAt: '2026-04-01T10:00:00.000Z' })
  } as Pick<ApiService, 'loginHints' | 'captcha'>;
  const sessionStub = {
    loading: () => false,
    login: async () => undefined,
    homeUrl: () => '/workspace/warehouse-clerk'
  } as Pick<SessionStore, 'loading' | 'login' | 'homeUrl'>;
  const routerStub = {
    navigateByUrl: async () => true
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LoginPageComponent],
    providers: [
      { provide: ApiService, useValue: { ...apiStub, ...overrides } },
      { provide: SessionStore, useValue: sessionStub },
      { provide: ActivatedRoute, useValue: routeStub },
      { provide: Router, useValue: routerStub }
    ]
  });
}

test('login page renders CAPTCHA through a safe image source and keeps the flow working', async () => {
  await createLoginFixture({
    loginHints: async () => ({ captchaRequired: true, lockedUntil: null }),
    captcha: async () => ({
      id: 'captcha-safe',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="120" height="40"/><text x="10" y="24">SAFE</text></svg>',
      expiresAt: '2026-04-01T10:00:00.000Z'
    })
  });

  const fixture = TestBed.createComponent(LoginPageComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  component.username = 'clerk.demo';

  await component.refreshHints();
  fixture.detectChanges();

  const image = fixture.nativeElement.querySelector('.captcha-image') as HTMLImageElement | null;
  assert.ok(image);
  assert.match(image.src, /^data:image\/svg\+xml/);
  assert.equal(fixture.nativeElement.querySelector('.captcha-svg'), null);
  assert.equal(component.captchaId, 'captcha-safe');
});

test('login page shows stable precheck failure feedback and preserves entered values', async () => {
  await createLoginFixture({
    loginHints: async () => {
      throw { error: { message: 'Precheck service offline' } };
    }
  });

  const fixture = TestBed.createComponent(LoginPageComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  component.username = 'operator.local';
  component.password = 'Operator!123';

  await component.refreshHints();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /login precheck failed/i);
  assert.equal(component.username, 'operator.local');
  assert.equal(component.password, 'Operator!123');
});
