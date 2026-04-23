import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);
  // On the server (SSR / prerender) auth state is not yet available — let the
  // route render and rely on the client-side check after hydration.
  if (!isPlatformBrowser(platformId)) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.currentUser()?.role === 'ADMIN' ? true : router.parseUrl('/');
};
