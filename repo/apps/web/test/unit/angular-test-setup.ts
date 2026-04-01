import 'zone.js';
import 'zone.js/testing';
import { JSDOM } from 'jsdom';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

let initialized = false;

export function setupAngularTestEnvironment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  const define = <K extends keyof typeof globalThis>(key: K, value: (typeof globalThis)[K]) => {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  };

  define('window', dom.window as typeof globalThis.window);
  define('document', dom.window.document);
  define('navigator', dom.window.navigator);
  define('HTMLElement', dom.window.HTMLElement);
  define('Element', dom.window.Element);
  define('Node', dom.window.Node);
  define('Event', dom.window.Event);
  define('CustomEvent', dom.window.CustomEvent);
  define('MouseEvent', dom.window.MouseEvent);
  define('KeyboardEvent', dom.window.KeyboardEvent);
  define('MutationObserver', dom.window.MutationObserver);
  define('getComputedStyle', dom.window.getComputedStyle.bind(dom.window) as typeof getComputedStyle);
  define('requestAnimationFrame', ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16)) as typeof requestAnimationFrame);
  define('cancelAnimationFrame', ((handle: number) => clearTimeout(handle)) as typeof cancelAnimationFrame);
  define('CSS', dom.window.CSS);

  if (!initialized) {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
    initialized = true;
  }

  return dom;
}
