export interface LoginRequest { email: string; password: string; }
export interface UserResponse { id: number; email: string; role: 'USER' | 'ADMIN'; active: boolean; }
export interface CsrfToken { token: string; headerName: string; parameterName: string; }
