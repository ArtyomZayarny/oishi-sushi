import { Route } from '@angular/router';

import { adminGuard } from './guards/admin.guard';
import { AppLayoutComponent } from './layout/app-layout.component';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomeComponent },
      { path: 'auth/login', component: LoginComponent },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/admin.component').then((m) => m.AdminComponent),
      },
    ],
  },
];
