import { computed, Injectable, signal } from '@angular/core';
import type { User } from '@org/shared-types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
}
