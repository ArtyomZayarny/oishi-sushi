import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { catchError, Observable, of } from 'rxjs';

import { CategoryWithMeals, MenuService } from '../../services/menu.service';

export type MenuData = CategoryWithMeals[];

export const menuResolver: ResolveFn<MenuData> = (): Observable<MenuData> => {
  const menu = inject(MenuService);
  return menu.list().pipe(catchError(() => of([] as MenuData)));
};
