import { jsonRoute } from "@/lib/api";
import {
  getLgThinQSubscriptions,
  setLgThinQSubscription,
} from "@/lib/providers/lg-thinq/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

export async function GET() {
  return jsonRoute(async () => ({
    ok: true,
    subscriptions: await getLgThinQSubscriptions(),
  }));
}

export async function POST(request: Request) {
  return updateSubscription(request, true);
}

export async function DELETE(request: Request) {
  return updateSubscription(request, false);
}

function updateSubscription(request: Request, subscribe: boolean) {
  return jsonRoute(async () => {
    const body = await request.json();
    const kind = body?.kind;
    if (kind !== "event" && kind !== "push") {
      throw new Error("Subscription kind must be event or push.");
    }
    return {
      ok: true,
      subscribed: subscribe,
      kind,
      result: await setLgThinQSubscription(
        String(body?.deviceId ?? ""),
        kind,
        subscribe,
      ),
    };
  });
}
