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
    <section data-login class="mx-auto max-w-md py-10 sm:py-14">
      <span
        class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--amber)]"
      >
        — Welcome back
      </span>
      <h1
        class="font-display mt-2 text-[32px] font-light tracking-[-0.01em] text-[var(--text-primary)] sm:text-[40px]"
      >
        Sign in
      </h1>

      <button
        type="button"
        data-login-google
        [disabled]="googlePending()"
        (click)="signInWithGoogle()"
        class="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-primary)] transition-colors hover:border-[var(--amber)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {{ googlePending() ? 'Connecting…' : 'Continue with Google' }}
      </button>

      <div
        aria-hidden="true"
        class="mt-6 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]"
      >
        <span class="h-px flex-1 bg-[var(--hairline)]"></span>
        <span>Or</span>
        <span class="h-px flex-1 bg-[var(--hairline)]"></span>
      </div>

      <form
        [formGroup]="form"
        (ngSubmit)="submit()"
        class="mt-6 grid gap-5"
        novalidate
      >
        <label class="grid gap-2">
          <span
            class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]"
          >
            Email
          </span>
          <input
            data-login-email
            type="email"
            formControlName="email"
            autocomplete="email"
            class="h-11 rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] px-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] transition-colors focus:border-[var(--amber)] focus:outline-none"
          />
        </label>
        <label class="grid gap-2">
          <span
            class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]"
          >
            Password
          </span>
          <input
            data-login-password
            type="password"
            formControlName="password"
            autocomplete="current-password"
            class="h-11 rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] px-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] transition-colors focus:border-[var(--amber)] focus:outline-none"
          />
        </label>

        @if (errorMessage()) {
          <p
            data-login-error
            class="rounded-[2px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200"
          >
            {{ errorMessage() }}
          </p>
        }

        <button
          type="submit"
          data-login-submit
          [disabled]="form.invalid || pending()"
          class="mt-2 h-11 rounded-[2px] bg-[var(--amber)] text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--canvas)] transition-colors hover:bg-[var(--amber-bright)] disabled:cursor-not-allowed disabled:bg-[var(--hairline)] disabled:text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
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
  readonly googlePending = signal(false);
  readonly errorMessage = signal<string | null>(null);

  signInWithGoogle(): void {
    if (this.googlePending()) return;
    this.googlePending.set(true);
    this.errorMessage.set(null);
    console.info('[auth:google:stub] not yet wired');
    setTimeout(() => {
      this.googlePending.set(false);
      this.errorMessage.set('Google sign-in is not configured yet.');
    }, 800);
  }

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
