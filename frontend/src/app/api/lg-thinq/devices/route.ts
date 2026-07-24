import { jsonRoute } from "@/lib/api";
import { getLgThinQDevices } from "@/lib/providers/lg-thinq/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

export async function GET() {
  return jsonRoute(async () => ({
    ok: true,
    devices: await getLgThinQDevices(),
  }));
}
