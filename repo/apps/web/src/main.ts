import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch(() => {
  const main = document.createElement('main');
  main.setAttribute('style', 'padding:24px;font-family:system-ui,sans-serif;background:#0c0910;color:#f5f2fa;min-height:100vh;');

  const heading = document.createElement('h1');
  heading.setAttribute('style', 'margin:0 0 12px;font-size:24px;');
  heading.textContent = 'OmniStock failed to start';

  const copy = document.createElement('p');
  copy.setAttribute('style', 'margin:0;max-width:48rem;color:#c9bde0;');
  copy.textContent = 'The local application shell could not be initialized. Refresh the page or restart the local frontend service.';

  main.append(heading, copy);
  document.body.replaceChildren(main);
});
