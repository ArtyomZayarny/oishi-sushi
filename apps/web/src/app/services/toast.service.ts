import { Injectable, signal } from '@angular/core';

export type ToastLevel = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  level: ToastLevel;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly messages = signal<ToastMessage[]>([]);

  info(text: string): void {
    this.push('info', text);
  }

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  dismiss(id: number): void {
    this.messages.update((xs) => xs.filter((x) => x.id !== id));
  }

  private push(level: ToastLevel, text: string): void {
    const id = this.nextId++;
    this.messages.update((xs) => [...xs, { id, level, text }]);
  }
}
