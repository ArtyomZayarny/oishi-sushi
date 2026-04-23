import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Order, OrderCreateReq } from '@org/shared-types';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from './menu.service';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  create(dto: OrderCreateReq): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders`, dto);
  }
}
