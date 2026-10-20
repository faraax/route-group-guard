import type { NextRequest, NextResponse } from 'next/server';
import type { RouteGuardOptions } from './index.js';

export function createRouteGuardMiddleware(
  options?: RouteGuardOptions
): (req: NextRequest) => NextResponse;

export type { RouteGuardOptions };
