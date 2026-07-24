import { jsonRoute } from "@/lib/api";
import { setLgAirConditionerPower } from "@/lib/providers/lg-thinq/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const body = await request.json();
    if (typeof body?.on !== "boolean") {
      throw new Error("A boolean air conditioner on state is required.");
    }
    return setLgAirConditionerPower(String(body?.deviceId ?? ""), body.on);
  });
}
