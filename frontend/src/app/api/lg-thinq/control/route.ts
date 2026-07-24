import { jsonRoute } from "@/lib/api";
import { controlLgThinQDevice } from "@/lib/providers/lg-thinq/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const body = await request.json();
    const payload = body?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("An LG ThinQ control payload object is required.");
    }
    return {
      ok: true,
      result: await controlLgThinQDevice(String(body?.deviceId ?? ""), payload),
    };
  });
}
