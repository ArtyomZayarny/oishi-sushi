import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-10 text-center">
      <h1 class="text-4xl font-bold tracking-tight">Fresh sushi, fast.</h1>
      <p class="mt-3 text-slate-600">
        Order from our seasonal menu and track delivery in real time.
      </p>
      <a
        routerLink="/menu"
        class="mt-6 inline-block rounded bg-slate-900 px-5 py-2 text-white hover:bg-slate-700"
      >
        View menu
      </a>
    </section>
  `,
})
export class HomeComponent {}
