import { jsonRoute } from "@/lib/api";
import { getLgThinQDeviceStatus } from "@/lib/providers/lg-thinq/client";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

export async function GET(request: NextRequest) {
  return jsonRoute(async () => ({
    ok: true,
    status: await getLgThinQDeviceStatus(
      request.nextUrl.searchParams.get("deviceId") ?? "",
    ),
  }));
}
