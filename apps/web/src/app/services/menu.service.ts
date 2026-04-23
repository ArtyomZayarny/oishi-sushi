import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import type { Category, Meal } from '@org/shared-types';
import type { Observable } from 'rxjs';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});

export type CategoryWithMeals = Category & { meals: Meal[] };

@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Observable<CategoryWithMeals[]> {
    return this.http.get<CategoryWithMeals[]>(`${this.base}/menu`);
  }
}
