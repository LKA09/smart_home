import { jsonRoute } from "@/lib/api";
import { getLgThinQConfiguration } from "@/lib/providers/lg-thinq/client";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export async function GET() {
  return jsonRoute(async () => ({
    ok: true,
    provider: "lg-thinq",
    ...getLgThinQConfiguration(),
  }));
}
