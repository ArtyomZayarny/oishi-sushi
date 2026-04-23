import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-login class="mx-auto max-w-md py-10">
      <h1 class="text-2xl font-bold">Sign in</h1>
      <p class="mt-2 text-sm text-slate-600">
        Use the seeded demo credentials shown in the README.
      </p>

      <form
        [formGroup]="form"
        (ngSubmit)="submit()"
        class="mt-6 grid gap-3"
        novalidate
      >
        <label class="grid gap-1 text-sm">
          <span class="text-slate-600">Email</span>
          <input
            data-login-email
            type="email"
            formControlName="email"
            autocomplete="email"
            class="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-slate-600">Password</span>
          <input
            data-login-password
            type="password"
            formControlName="password"
            autocomplete="current-password"
            class="rounded border border-slate-300 px-2 py-1"
          />
        </label>

        @if (errorMessage()) {
          <p data-login-error class="text-sm text-red-600">
            {{ errorMessage() }}
          </p>
        }

        <button
          type="submit"
          data-login-submit
          [disabled]="form.invalid || pending()"
          class="mt-2 rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {{ pending() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </section>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]],
  });

  readonly pending = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid || this.pending()) return;
    this.pending.set(true);
    this.errorMessage.set(null);
    try {
      const user = await this.auth.login(this.form.getRawValue());
      const target = user.role === 'ADMIN' ? '/admin' : '/menu';
      await this.router.navigateByUrl(target);
    } catch {
      this.errorMessage.set('Invalid email or password.');
    } finally {
      this.pending.set(false);
    }
  }
}
