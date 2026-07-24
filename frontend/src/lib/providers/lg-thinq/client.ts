import crypto from "node:crypto";
import { AirConditionerDevice } from "thinqconnect/dist/devices/AirConditioner";
import {
  ThinQApi,
  type ThinQApiResponse,
} from "thinqconnect/dist/ThinQAPI";
import type { DynamicObjectOrStringArray } from "thinqconnect/dist/types/Devices";

export const LG_AIR_CONDITIONER_TYPE = "DEVICE_AIR_CONDITIONER";

export type LgThinQDevice = {
  deviceId: string;
  deviceType: string;
  alias: string;
  modelName: string;
  reportable: boolean;
  raw: Record<string, unknown>;
};

type LgThinQConfig = {
  accessToken: string;
  countryCode: string;
  clientId: string;
  explicitClientId: boolean;
};

type LgThinQState = {
  key?: string;
  api?: ThinQApi;
};

const LG_THINQ_STATE_KEY = Symbol.for("smart-home-dashboard.lg-thinq");
const globalState = globalThis as typeof globalThis & {
  [LG_THINQ_STATE_KEY]?: LgThinQState;
};
const state = globalState[LG_THINQ_STATE_KEY] ?? {};
globalState[LG_THINQ_STATE_KEY] = state;

export function getLgThinQConfiguration() {
  const token = process.env.LG_THINQ_PAT?.trim();
  return {
    configured: Boolean(token),
    countryCode: process.env.LG_THINQ_COUNTRY?.trim().toUpperCase() || "KR",
    clientIdConfigured: Boolean(process.env.LG_THINQ_CLIENT_ID?.trim()),
  };
}

export async function getLgThinQDevices(): Promise<LgThinQDevice[]> {
  const response = await getApi().asyncGetDeviceList();
  const body = unwrap(response, "LG ThinQ device list");
  const items = findDeviceArray(body);
  return items.map(normalizeDevice).filter((device) => device.deviceId);
}

export async function getLgThinQDeviceStatus(deviceId: string) {
  const response = await getApi().asyncGetDeviceStatus(requireDeviceId(deviceId));
  return unwrap(response, "LG ThinQ device status");
}

export async function controlLgThinQDevice(
  deviceId: string,
  payload: Record<string, unknown>,
) {
  if (!Object.keys(payload).length) {
    throw new Error("LG ThinQ control payload is required.");
  }
  const response = await getApi().asyncPostDeviceControl(
    requireDeviceId(deviceId),
    payload,
  );
  return unwrap(response, "LG ThinQ device control");
}

export async function setLgAirConditionerPower(deviceId: string, on: boolean) {
  const id = requireDeviceId(deviceId);
  const [devices, profileResponse] = await Promise.all([
    getLgThinQDevices(),
    getApi().asyncGetDeviceProfile(id),
  ]);
  const metadata = devices.find((device) => device.deviceId === id);
  if (!metadata) {
    throw new Error("LG ThinQ device was not found.");
  }
  if (metadata.deviceType !== LG_AIR_CONDITIONER_TYPE) {
    throw new Error(`${metadata.alias || id} is not an LG air conditioner.`);
  }

  const profile = extractProfile(unwrap(profileResponse, "LG ThinQ device profile"));
  const device = new AirConditionerDevice(
    getApi(),
    metadata.deviceId,
    metadata.deviceType,
    metadata.modelName,
    metadata.alias,
    metadata.reportable,
    profile as Record<string, DynamicObjectOrStringArray>,
  );
  const operationProperty = device.profiles.getProperty("airConOperationMode");
  const writableValues = Array.isArray(operationProperty.w)
    ? operationProperty.w.filter((value): value is string => typeof value === "string")
    : [];
  const mode = findPowerMode(writableValues, on);
  if (!mode) {
    throw new Error(
      `This air conditioner does not expose a supported ${on ? "on" : "off"} mode. `
      + `Writable modes: ${writableValues.join(", ") || "none"}`,
    );
  }

  const response = await device.setAirConOperationMode(mode);
  if (!response) {
    throw new Error("LG ThinQ did not create an air conditioner control request.");
  }
  const result = unwrap(response, "LG ThinQ air conditioner control");
  return { ok: true, on, mode, result };
}

export async function getLgThinQSubscriptions() {
  const [events, pushes] = await Promise.all([
    getApi().asyncGetEventList(),
    getApi().asyncGetPushList(),
  ]);
  return {
    events: unwrap(events, "LG ThinQ event subscriptions"),
    pushes: unwrap(pushes, "LG ThinQ push subscriptions"),
  };
}

export async function setLgThinQSubscription(
  deviceId: string,
  kind: "event" | "push",
  subscribe: boolean,
) {
  const id = requireDeviceId(deviceId);
  const api = getApi();
  const response = kind === "event"
    ? subscribe
      ? await api.asyncPostEventSubscribe(id)
      : await api.asyncDeleteEventSubscribe(id)
    : subscribe
      ? await api.asyncPostPushSubscribe(id)
      : await api.asyncDeletePushSubscribe(id);
  return unwrap(response, `LG ThinQ ${kind} ${subscribe ? "subscribe" : "unsubscribe"}`);
}

export async function getLgThinQEnergyProfile(deviceId: string) {
  const response = await getApi().asyncGetDeviceEnergyProfile(requireDeviceId(deviceId));
  return unwrap(response, "LG ThinQ energy profile");
}

export async function getLgThinQRecentEnergy(deviceId: string) {
  const id = requireDeviceId(deviceId);
  const profile = await getLgThinQEnergyProfile(id);
  const properties = readEnergyProperties(profile);
  if (!properties.length) {
    return { supported: false, profile, usage: [] };
  }
  const endDate = formatKoreanDate(-1);
  const startDate = formatKoreanDate(-7);
  const usage = await Promise.all(
    properties.map(async (property) => ({
      property,
      data: await getLgThinQEnergyUsage({
        deviceId: id,
        property,
        period: "DAILY",
        startDate,
        endDate,
      }),
    })),
  );
  return {
    supported: true,
    period: "DAILY",
    startDate,
    endDate,
    profile,
    usage,
  };
}

export async function getLgThinQEnergyUsage(input: {
  deviceId: string;
  property: string;
  period: "DAILY" | "MONTHLY";
  startDate: string;
  endDate: string;
}) {
  if (!input.property.trim()) {
    throw new Error("An LG ThinQ energy property is required.");
  }
  const datePattern = input.period === "MONTHLY" ? /^\d{6}$/ : /^\d{8}$/;
  if (!datePattern.test(input.startDate) || !datePattern.test(input.endDate)) {
    throw new Error(
      `Energy dates must use ${input.period === "MONTHLY" ? "YYYYMM" : "YYYYMMDD"}.`,
    );
  }
  const response = await getApi().asyncGetDeviceEnergyUsage(
    requireDeviceId(input.deviceId),
    input.property.trim(),
    input.period,
    input.startDate,
    input.endDate,
  );
  return unwrap(response, "LG ThinQ energy usage");
}

function getApi() {
  const config = getConfig();
  const key = `${config.countryCode}:${config.clientId}:${fingerprint(config.accessToken)}`;
  if (!state.api || state.key !== key) {
    state.api = new ThinQApi(config.accessToken, config.countryCode, config.clientId);
    state.key = key;
  }
  return state.api;
}

function getConfig(): LgThinQConfig {
  const accessToken = process.env.LG_THINQ_PAT?.trim();
  if (!accessToken) {
    throw new Error("LG ThinQ is not configured. Set LG_THINQ_PAT.");
  }
  const configuredClientId = process.env.LG_THINQ_CLIENT_ID?.trim();
  return {
    accessToken,
    countryCode: process.env.LG_THINQ_COUNTRY?.trim().toUpperCase() || "KR",
    clientId: configuredClientId || deterministicUuid(accessToken),
    explicitClientId: Boolean(configuredClientId),
  };
}

function unwrap(response: ThinQApiResponse, action: string): Record<string, unknown> {
  if (response.status < 200 || response.status >= 300 || response.errorCode) {
    throw new Error(
      `${action} failed (${response.errorCode || response.status}): `
      + `${response.errorMessage || "Unknown LG ThinQ error"}`,
    );
  }
  return asRecord(response.body);
}

function normalizeDevice(value: Record<string, unknown>): LgThinQDevice {
  return {
    deviceId: firstString(value, ["deviceId", "deviceID", "id"]),
    deviceType: firstString(value, ["deviceType", "type"]),
    alias: firstString(value, ["alias", "deviceName", "name"]),
    modelName: firstString(value, ["modelName", "model"]),
    reportable: value.reportable !== false,
    raw: value,
  };
}

function findDeviceArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }
  for (const key of ["devices", "items", "deviceList"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }
  for (const candidate of Object.values(value)) {
    const nested = findDeviceArray(candidate);
    if (nested.some((item) => firstString(item, ["deviceId", "deviceID", "id"]))) {
      return nested;
    }
  }
  return [];
}

function extractProfile(body: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(body.profile)) {
    return body.profile;
  }
  if (isRecord(body.property)) {
    return body;
  }
  for (const value of Object.values(body)) {
    if (isRecord(value)) {
      const profile = extractProfile(value);
      if (isRecord(profile.property)) {
        return profile;
      }
    }
  }
  throw new Error("LG ThinQ device profile did not contain writable properties.");
}

function findPowerMode(values: string[], on: boolean) {
  const exact = on
    ? ["POWER_ON", "ON", "START", "RUN"]
    : ["POWER_OFF", "OFF", "STOP"];
  for (const candidate of exact) {
    const value = values.find((item) => normalizeMode(item) === candidate);
    if (value) return value;
  }
  return values.find((item) => {
    const normalized = normalizeMode(item);
    return on
      ? normalized.endsWith("_ON") && !normalized.includes("OFF")
      : normalized.endsWith("_OFF") || normalized === "OFF";
  });
}

function normalizeMode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function requireDeviceId(deviceId: string) {
  const id = deviceId.trim();
  if (!id) throw new Error("An LG ThinQ device ID is required.");
  return id;
}

function deterministicUuid(secret: string) {
  const bytes = Buffer.from(crypto.createHash("sha256").update(secret).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function firstString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key] as string;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnergyProperties(profile: Record<string, unknown>) {
  const result = isRecord(profile.result) ? profile.result : profile;
  const properties = result.property;
  return Array.isArray(properties)
    ? properties.filter((value): value is string => typeof value === "string")
    : [];
}

function formatKoreanDate(dayOffset: number) {
  const koreaTime = Date.now() + 9 * 60 * 60 * 1000 + dayOffset * 24 * 60 * 60 * 1000;
  return new Date(koreaTime).toISOString().slice(0, 10).replaceAll("-", "");
}
