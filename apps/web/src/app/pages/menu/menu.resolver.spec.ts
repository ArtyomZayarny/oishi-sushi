import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import type { Category, Meal } from '@org/shared-types';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

import { MenuService } from '../../services/menu.service';
import { menuResolver, MenuData } from './menu.resolver';

const SAMPLE: Array<Category & { meals: Meal[] }> = [
  {
    id: 'c1',
    name: 'Maki',
    slug: 'maki',
    sortOrder: 1,
    meals: [],
  },
];

const run = (listImpl: jest.Mock) => {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: MenuService, useValue: { list: listImpl } },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    menuResolver({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return firstValueFrom(result as Observable<MenuData>);
};

describe('menuResolver', () => {
  it('returns categories from MenuService.list()', async () => {
    const list = jest.fn().mockReturnValue(of(SAMPLE));
    const result = await run(list);
    expect(list).toHaveBeenCalled();
    expect(result).toEqual(SAMPLE);
  });

  it('falls back to an empty array when the request fails', async () => {
    const list = jest.fn().mockReturnValue(throwError(() => new Error('boom')));
    const result = await run(list);
    expect(result).toEqual([]);
  });
});
