import type { UserRole } from './enums.js';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string | Date;
}

export interface RegisterReq {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginReq {
  email: string;
  password: string;
}

export interface AuthResp {
  user: User;
}
