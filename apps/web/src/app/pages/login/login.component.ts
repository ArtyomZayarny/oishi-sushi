import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-md py-10">
      <h1 class="text-2xl font-bold">Sign in</h1>
      <p class="mt-2 text-slate-600">Login form coming soon.</p>
    </section>
  `,
})
export class LoginComponent {}
