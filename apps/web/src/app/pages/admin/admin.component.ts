import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-10">
      <h1 class="text-2xl font-bold">Admin</h1>
      <p class="mt-2 text-slate-600">Admin panel lands in a later phase.</p>
    </section>
  `,
})
export class AdminComponent {}
