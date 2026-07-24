import { jsonRoute } from "@/lib/api";
import {
  getLgThinQEnergyProfile,
  getLgThinQRecentEnergy,
  getLgThinQEnergyUsage,
} from "@/lib/providers/lg-thinq/client";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

export async function GET(request: NextRequest) {
  return jsonRoute(async () => {
    const params = request.nextUrl.searchParams;
    const deviceId = params.get("deviceId") ?? "";
    if (params.get("recent") === "true") {
      return {
        ok: true,
        energy: await getLgThinQRecentEnergy(deviceId),
      };
    }
    const property = params.get("property");
    if (!property) {
      return {
        ok: true,
        profile: await getLgThinQEnergyProfile(deviceId),
      };
    }
    const period = params.get("period") === "MONTHLY" ? "MONTHLY" : "DAILY";
    return {
      ok: true,
      usage: await getLgThinQEnergyUsage({
        deviceId,
        property,
        period,
        startDate: params.get("startDate") ?? "",
        endDate: params.get("endDate") ?? "",
      }),
    };
  });
}
