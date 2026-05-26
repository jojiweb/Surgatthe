import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto:
     * - _next/static, _next/image
     * - favicon.ico, manifest.json, icons/*, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|robots.txt).*)",
  ],
};
