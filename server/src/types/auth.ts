import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  phone: string;
  fullName: string;
  role: UserRole;
  complexId: string | null;
  permissions: string[];
  unitIds: string[];
}

export interface JWTAccessTokenClaims {
  sub: string;            // User ID (UUID)
  phone: string;          // User Phone Number
  fullName: string;       // User Full Name
  role: UserRole;         // SUPER_ADMIN | COMPLEX_MANAGER | SUB_MANAGER | RESIDENT
  complexId: string | null;// Complex ID (null for platform SUPER_ADMIN)
  permissions: string[];  // Sub-manager active permissions array
  unitIds: string[];      // Associated unit IDs for RESIDENT role
  tokenType: 'ACCESS';
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
