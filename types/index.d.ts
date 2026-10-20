import type { NextRequest, NextResponse } from 'next/server';

export type AccessType = 'public' | 'private';
export type RuleMode = 'any' | 'all';

export interface ManifestRoute {
  path: string;
  access?: AccessType;
  roles: string[];
  permissions: string[];
  roleMode?: RuleMode;
  permissionMode?: RuleMode;
}

export interface RouteOverride {
  path: string;
  access?: AccessType;
  roles?: string[];
  permissions?: string[];
  roleMode?: RuleMode;
  permissionMode?: RuleMode;
}

export interface Session {
  isAuthenticated: boolean;
  token: string | null;
  payload: any | null;
  role?: string | string[];
  permissions: string[];
}

export interface RouteGuardRedirects {
  login?: string;
  home?: string;
  unauthorized?: string;
}

export interface RouteGuardOptions {
  manifest?: ManifestRoute[] | { routes: ManifestRoute[] };
  overrides?: RouteOverride[] | { routes: RouteOverride[] };
  cookieName?: string;
  defaultAccess?: AccessType;
  redirects?: RouteGuardRedirects;
  redirectAuthenticatedFrom?: string[];
  getToken?: (cookies: any, cookieName: string) => string | null;
  decodeToken?: (raw: string) => any | null;
  verifyToken?: (payload: any | null, clockToleranceSec?: number) => boolean;
  getRole?: (payload: any | null) => string | string[] | undefined;
  getPermissions?: (payload: any | null) => string[];
  getRoleHome?: (role: string | string[] | undefined, session: Session) => string | undefined;
  onUnauthenticated?: (req: NextRequest, session: Session) => NextResponse | void | undefined;
  onUnauthorized?: (req: NextRequest, session: Session, route: ManifestRoute) => NextResponse | void | undefined;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: 'unauthenticated' | 'role' | 'permission';
}

export interface MatchResult extends ManifestRoute {
  params: Record<string, string | string[]>;
}

export interface Matcher {
  match: (pathname: string) => MatchResult | null;
}

export function createRouteGuardMiddleware(
  options?: RouteGuardOptions
): (req: NextRequest) => NextResponse;

export function defineConfig(overrides: RouteOverride[]): RouteOverride[];

export function mergeOverrides(
  manifest: ManifestRoute[] | { routes: ManifestRoute[] },
  overrides?: RouteOverride[] | { routes: RouteOverride[] }
): ManifestRoute[];

export function scanAppDir(appDir: string): {
  routes: ManifestRoute[];
  ignoredGroups: string[];
};

export function lintRoutes(routes: ManifestRoute[]): string[];

export function createMatcher(routes: ManifestRoute[]): Matcher;

export function checkAccess(
  route: {
    access?: AccessType;
    roles?: string[];
    permissions?: string[];
    roleMode?: RuleMode;
    permissionMode?: RuleMode;
  },
  session: Session,
  defaultAccess?: AccessType
): AccessDecision;

export function resolveSession(
  cookies: any,
  options?: {
    cookieName?: string;
    getToken?: (cookies: any, cookieName: string) => string | null;
    decodeToken?: (raw: string) => any | null;
    verifyToken?: (payload: any | null, clockToleranceSec?: number) => boolean;
    getRole?: (payload: any | null) => string | string[] | undefined;
    getPermissions?: (payload: any | null) => string[];
  }
): Session;

export function defaultGetToken(cookies: any, cookieName: string): string | null;
export function defaultDecodeToken(raw: string): any | null;
export function defaultVerifyToken(payload: any | null, clockToleranceSec?: number): boolean;
export function defaultGetRole(payload: any | null): string | string[] | undefined;
export function defaultGetPermissions(payload: any | null): string[];
