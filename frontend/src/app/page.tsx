"use client";

import {
  Activity,
  AirVent,
  ArrowUp,
  Bell,
  CheckCircle2,
  Gauge,
  Home,
  Lightbulb,
  List,
  Lock,
  LogIn,
  PanelRight,
  Power,
  Radio,
  RefreshCw,
  Settings,
  TerminalSquare,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Device = {
  displayName: string;
  name: string;
  disabled: boolean;
  deviceType: string;
  deviceId: string;
  operation?: Record<string, unknown>;
};

type LogEntry = {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
};

type Health = {
  ok: boolean;
  session: {
    signedIn: boolean;
    requiresPasscode: boolean;
    devices: number;
    lights: number;
  };
};

type SettingsResponse = {
  settings: {
    provider: string;
    storage: string;
    username: string;
    wallpadVersion: string;
    uuid: string;
  };
};

type DeviceMapping = {
  name?: string;
  hidden?: boolean;
};

type LgThinQHealth = {
  ok: boolean;
  configured: boolean;
  countryCode: string;
  clientIdConfigured: boolean;
};

type LgThinQDevice = {
  deviceId: string;
  deviceType: string;
  alias: string;
  modelName: string;
  reportable: boolean;
  raw: Record<string, unknown>;
};

const DEVICE_MAPPINGS_KEY = "smart-home.device-mappings";
const LG_AIR_CONDITIONER_TYPE = "DEVICE_AIR_CONDITIONER";
const tabs = ["Dashboard", "Devices", "LG ThinQ", "Settings", "Logs"] as const;
type Tab = (typeof tabs)[number];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<SettingsResponse["settings"] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lightState, setLightState] = useState<Record<string, boolean>>({});
  const [pendingLights, setPendingLights] = useState<Set<string>>(() => new Set());
  const [deviceMappings, setDeviceMappings] = useState<Record<string, DeviceMapping>>({});
  const [lgHealth, setLgHealth] = useState<LgThinQHealth | null>(null);
  const [lgDevices, setLgDevices] = useState<LgThinQDevice[]>([]);
  const [lgAcState, setLgAcState] = useState<Record<string, boolean>>({});
  const [lgPending, setLgPending] = useState<Set<string>>(() => new Set());
  const [lgDetails, setLgDetails] = useState<Record<string, unknown>>({});

  const mappedDevices = useMemo(
    () =>
      devices.map((device) => {
        const mapping = deviceMappings[device.deviceId];
        return {
          ...device,
          displayName: mapping?.name?.trim() || device.displayName,
          disabled: device.disabled || Boolean(mapping?.hidden),
        };
      }),
    [deviceMappings, devices],
  );
  const lights = useMemo(
    () => mappedDevices.filter((device) => device.deviceType === "light" && !device.disabled),
    [mappedDevices],
  );
  const groups = useMemo(() => {
    return mappedDevices.reduce<Record<string, Device[]>>((acc, device) => {
      acc[device.deviceType] = acc[device.deviceType] ?? [];
      acc[device.deviceType].push(device);
      return acc;
    }, {});
  }, [mappedDevices]);

  async function refresh() {
    const [nextHealth, nextLogs, nextSettings] = await Promise.all([
      api<Health>("/api/health"),
      api<{ logs: LogEntry[] }>("/api/logs"),
      api<SettingsResponse>("/api/settings"),
    ]);
    setHealth(nextHealth);
    setLogs(nextLogs.logs);
    setSettings(nextSettings.settings);
    setSignedIn(nextHealth.session.signedIn);
    setRequiresPasscode(nextHealth.session.requiresPasscode);

    if (nextHealth.session.signedIn) {
      const deviceResponse = await api<{ devices: Device[] }>("/api/devices");
      setDevices(deviceResponse.devices);
      setLightState(
        Object.fromEntries(
          deviceResponse.devices
            .filter((device) => device.deviceType === "light")
            .map((device) => [device.deviceId, isDeviceOn(device)]),
        ),
      );
    } else {
      setDevices([]);
      setLightState({});
    }
  }

  useEffect(() => {
    try {
      const savedMappings = window.localStorage.getItem(DEVICE_MAPPINGS_KEY);
      if (savedMappings) {
        setDeviceMappings(JSON.parse(savedMappings));
      }
    } catch {
      window.localStorage.removeItem(DEVICE_MAPPINGS_KEY);
    }
    refresh().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeTab === "LG ThinQ") {
      refreshLgThinQ().catch((error) =>
        setMessage(error instanceof Error ? error.message : "LG ThinQ refresh failed."),
      );
    }
  }, [activeTab]);

  function updateDeviceMapping(deviceId: string, patch: DeviceMapping) {
    setDeviceMappings((current) => {
      const next = {
        ...current,
        [deviceId]: {
          ...current[deviceId],
          ...patch,
        },
      };
      window.localStorage.setItem(DEVICE_MAPPINGS_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ ok: boolean; requiresPasscode: boolean; code?: string }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (result.requiresPasscode) {
        setRequiresPasscode(true);
        setMessage("Enter the wallpad passcode to complete authorization.");
      } else if (!result.ok) {
        setMessage(result.code ?? "Smart eLife login failed.");
      } else {
        setSignedIn(true);
        setMessage("Signed in.");
        await refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ ok: boolean; code?: string }>("/api/passcode", {
        method: "POST",
        body: JSON.stringify({ passcode, username, password }),
      });
      if (!result.ok) {
        setMessage(result.code ?? "Invalid passcode.");
      } else {
        setRequiresPasscode(false);
        setSignedIn(true);
        setMessage("Wallpad authorized.");
        await refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passcode failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleElevator() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ ok: boolean }>("/api/elevator", { method: "POST" });
      setMessage(result.ok ? "Elevator call sent." : "Elevator call failed.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Elevator call failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLight(device: Device) {
    if (pendingLights.has(device.deviceId)) {
      return;
    }
    const next = !lightState[device.deviceId];
    setPendingLights((current) => new Set(current).add(device.deviceId));
    setLightState((current) => ({ ...current, [device.deviceId]: next }));
    try {
      const result = await api<{ ok: boolean; on: boolean }>("/api/light", {
        method: "POST",
        body: JSON.stringify({ deviceId: device.deviceId, on: next }),
      });
      if (!result.ok) {
        setLightState((current) => ({ ...current, [device.deviceId]: !next }));
        setMessage(`Could not update ${device.displayName}.`);
      } else {
        setLightState((current) => ({ ...current, [device.deviceId]: result.on }));
        setDevices((current) =>
          current.map((candidate) =>
            candidate.deviceId === device.deviceId
              ? {
                  ...candidate,
                  operation: {
                    ...candidate.operation,
                    status: result.on ? "on" : "off",
                  },
                }
              : candidate,
          ),
        );
        setMessage(`${device.displayName} ${result.on ? "on" : "off"}.`);
      }
    } catch (error) {
      setLightState((current) => ({ ...current, [device.deviceId]: !next }));
      setMessage(error instanceof Error ? error.message : "Light update failed.");
    } finally {
      setPendingLights((current) => {
        const updated = new Set(current);
        updated.delete(device.deviceId);
        return updated;
      });
    }
  }

  async function refreshLgThinQ() {
    const nextHealth = await api<LgThinQHealth>("/api/lg-thinq/health");
    setLgHealth(nextHealth);
    if (!nextHealth.configured) {
      setLgDevices([]);
      setLgAcState({});
      return;
    }
    const response = await api<{ devices: LgThinQDevice[] }>("/api/lg-thinq/devices");
    setLgDevices(response.devices);
    const airConditioners = response.devices.filter(
      (device) => device.deviceType === LG_AIR_CONDITIONER_TYPE,
    );
    const statuses = await Promise.allSettled(
      airConditioners.map(async (device) => ({
        device,
        status: await api<{ status: Record<string, unknown> }>(
          `/api/lg-thinq/status?deviceId=${encodeURIComponent(device.deviceId)}`,
        ),
      })),
    );
    setLgAcState((current) => {
      const next = { ...current };
      for (const result of statuses) {
        if (result.status === "fulfilled") {
          const operationMode = findNestedValue(
            result.value.status.status,
            "airConOperationMode",
          );
          if (typeof operationMode === "string") {
            next[result.value.device.deviceId] = !operationMode.toUpperCase().includes("OFF");
          }
        }
      }
      return next;
    });
  }

  async function toggleLgAirConditioner(device: LgThinQDevice) {
    if (lgPending.has(device.deviceId)) return;
    const on = !lgAcState[device.deviceId];
    setLgPending((current) => new Set(current).add(device.deviceId));
    setLgAcState((current) => ({ ...current, [device.deviceId]: on }));
    setMessage("");
    try {
      const result = await api<{ ok: boolean; on: boolean; mode: string }>(
        "/api/lg-thinq/air-conditioner",
        {
          method: "POST",
          body: JSON.stringify({ deviceId: device.deviceId, on }),
        },
      );
      setLgAcState((current) => ({ ...current, [device.deviceId]: result.on }));
      setMessage(`${device.alias || device.modelName || "LG air conditioner"} ${result.on ? "on" : "off"}.`);
    } catch (error) {
      setLgAcState((current) => ({ ...current, [device.deviceId]: !on }));
      setMessage(error instanceof Error ? error.message : "LG air conditioner control failed.");
    } finally {
      setLgPending((current) => {
        const next = new Set(current);
        next.delete(device.deviceId);
        return next;
      });
    }
  }

  async function loadLgStatus(device: LgThinQDevice) {
    await runLgDeviceAction(device, "status", async () => {
      const result = await api<{ status: Record<string, unknown> }>(
        `/api/lg-thinq/status?deviceId=${encodeURIComponent(device.deviceId)}`,
      );
      return result.status;
    });
  }

  async function updateLgSubscription(
    device: LgThinQDevice,
    kind: "event" | "push",
    subscribe: boolean,
  ) {
    await runLgDeviceAction(device, `${kind}-${subscribe ? "on" : "off"}`, async () =>
      api<Record<string, unknown>>("/api/lg-thinq/subscriptions", {
        method: subscribe ? "POST" : "DELETE",
        body: JSON.stringify({ deviceId: device.deviceId, kind }),
      }),
    );
  }

  async function loadLgEnergy(device: LgThinQDevice) {
    await runLgDeviceAction(device, "energy", async () =>
      api<Record<string, unknown>>(
        `/api/lg-thinq/energy?recent=true&deviceId=${encodeURIComponent(device.deviceId)}`,
      ),
    );
  }

  async function loadLgSubscriptions() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<Record<string, unknown>>("/api/lg-thinq/subscriptions");
      setLgDetails((current) => ({ ...current, subscriptions: result }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LG ThinQ subscription lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runLgDeviceAction(
    device: LgThinQDevice,
    action: string,
    handler: () => Promise<unknown>,
  ) {
    const key = `${device.deviceId}:${action}`;
    setLgPending((current) => new Set(current).add(key));
    setMessage("");
    try {
      const result = await handler();
      setLgDetails((current) => ({ ...current, [device.deviceId]: result }));
      setMessage(`${device.alias || device.modelName || device.deviceId}: ${action} completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `LG ThinQ ${action} failed.`);
    } finally {
      setLgPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen pb-10">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/65 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
              <Home size={21} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-stone-950">Smart Home</h1>
              <p className="text-xs font-medium text-stone-500">Smart eLife · LG ThinQ</p>
            </div>
          </div>
          <button
            aria-label="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-blue-600 shadow-sm hover:bg-white"
            onClick={() => refresh().catch((error) => setMessage(String(error)))}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-7 lg:py-8">
        <nav className="glass-panel flex gap-1 overflow-x-auto rounded-2xl p-1.5 lg:sticky lg:top-24 lg:block lg:h-fit lg:space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`min-w-max rounded-xl px-3.5 py-2.5 text-sm font-medium lg:w-full lg:text-left ${
                activeTab === tab
                  ? "bg-white text-stone-950 shadow-sm ring-1 ring-black/5"
                  : "text-stone-500 hover:bg-white/55 hover:text-stone-900"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        <section className="min-w-0 space-y-5">
          {message ? (
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-900 shadow-sm backdrop-blur-xl">{message}</div>
          ) : null}

          {!signedIn && activeTab !== "LG ThinQ" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <form className="glass-panel rounded-3xl p-5 sm:p-6" onSubmit={handleLogin}>
                <div className="mb-4 flex items-center gap-2">
                  <LogIn size={18} />
                  <h2 className="font-semibold">Login</h2>
                </div>
                <label className="mb-3 block text-sm">
                  <span className="mb-1 block text-stone-600">Smart eLife email</span>
                  <input
                    className="w-full rounded-xl border border-stone-200 bg-white/80 px-3.5 py-2.5 shadow-inner outline-none focus:border-blue-400"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    type="email"
                    autoComplete="email"
                  />
                </label>
                <label className="mb-4 block text-sm">
                  <span className="mb-1 block text-stone-600">Password</span>
                  <input
                    className="w-full rounded-xl border border-stone-200 bg-white/80 px-3.5 py-2.5 shadow-inner outline-none focus:border-blue-400"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                <button className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 disabled:opacity-60" disabled={busy}>
                  <Lock size={16} />
                  Sign in
                </button>
              </form>

              {requiresPasscode ? (
                <form className="glass-panel rounded-3xl p-5 sm:p-6" onSubmit={handlePasscode}>
                  <div className="mb-4 flex items-center gap-2">
                    <PanelRight size={18} />
                    <h2 className="font-semibold">Wallpad</h2>
                  </div>
                  <label className="mb-4 block text-sm">
                    <span className="mb-1 block text-stone-600">Passcode</span>
                    <input
                    className="w-full rounded-xl border border-stone-200 bg-white/80 px-3.5 py-2.5 shadow-inner outline-none focus:border-blue-400"
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <button className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 font-medium text-white shadow-lg shadow-stone-900/10 hover:bg-stone-800 disabled:opacity-60" disabled={busy}>
                    <CheckCircle2 size={16} />
                    Authorize
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {signedIn && activeTab === "Dashboard" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric icon={<Activity size={18} />} label="Session" value={health?.session.signedIn ? "Online" : "Offline"} />
                <Metric icon={<List size={18} />} label="Devices" value={String(health?.session.devices ?? devices.length)} />
                <Metric icon={<Lightbulb size={18} />} label="Lights" value={String(health?.session.lights ?? lights.length)} />
              </div>

              <div className="glass-panel rounded-3xl p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Elevator</h2>
                  <span className="text-sm text-stone-500">Exterior call</span>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 disabled:opacity-60"
                  onClick={handleElevator}
                  disabled={busy}
                >
                  <ArrowUp size={16} />
                  Call elevator
                </button>
              </div>

              <div className="glass-panel rounded-3xl p-5 sm:p-6">
                <h2 className="mb-4 font-semibold">Lights</h2>
                <div className="grid gap-2 md:grid-cols-2">
                  {lights.length ? (
                    lights.map((device) => (
                      <LightRow
                        key={device.deviceId}
                        device={device}
                        checked={Boolean(lightState[device.deviceId])}
                        disabled={pendingLights.has(device.deviceId)}
                        onToggle={() => toggleLight(device)}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-stone-500">No light devices have been discovered yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {signedIn && activeTab === "Devices" ? (
            <div className="space-y-3">
              {Object.entries(groups).map(([type, group]) => (
                <div key={type} className="glass-panel rounded-3xl p-5 sm:p-6">
                  <h2 className="mb-3 font-semibold">{type}</h2>
                  <div className="grid gap-2">
                    {group.map((device) => (
                      <div key={device.deviceId} className="grid gap-3 border-t border-stone-100 py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="min-w-0">
                          <input
                            aria-label={`Display name for ${device.name}`}
                            className="w-full rounded-xl border border-stone-200 bg-white/75 px-3.5 py-2.5 font-medium shadow-inner outline-none focus:border-blue-400"
                            value={deviceMappings[device.deviceId]?.name ?? ""}
                            placeholder={device.displayName}
                            onChange={(event) => updateDeviceMapping(device.deviceId, { name: event.target.value })}
                          />
                          <p className="text-xs text-stone-500">{device.deviceId}</p>
                        </div>
                        <button
                          className={`rounded-full px-4 py-2 text-sm font-medium ${
                            device.disabled
                              ? "bg-stone-200/80 text-stone-600"
                              : "bg-blue-600 text-white shadow-md shadow-blue-500/15"
                          }`}
                          onClick={() =>
                            updateDeviceMapping(device.deviceId, {
                              hidden: !Boolean(deviceMappings[device.deviceId]?.hidden),
                            })
                          }
                        >
                          {device.disabled ? "Show" : "Visible"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "LG ThinQ" ? (
            <div className="space-y-4">
              <div className="glass-panel rounded-3xl p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AirVent size={20} />
                    <div>
                      <h2 className="font-semibold">LG ThinQ</h2>
                      <p className="text-sm text-stone-500">
                        Official ThinQ Connect API · {lgHealth?.countryCode ?? "KR"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/70 px-4 py-2 text-sm font-medium shadow-sm hover:bg-white disabled:opacity-60"
                      onClick={() => loadLgSubscriptions()}
                      disabled={!lgHealth?.configured || busy}
                    >
                      <Radio size={15} />
                      Subscriptions
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-stone-900/10 hover:bg-stone-800 disabled:opacity-60"
                      onClick={() => refreshLgThinQ().catch((error) => setMessage(String(error)))}
                      disabled={busy}
                    >
                      <RefreshCw size={15} />
                      Refresh
                    </button>
                  </div>
                </div>
              </div>

              {lgHealth && !lgHealth.configured ? (
                <div className="rounded-3xl border border-amber-200/70 bg-amber-50/75 p-5 text-sm text-amber-950 shadow-sm backdrop-blur-xl">
                  <p className="font-semibold">LG ThinQ PAT configuration required</p>
                  <p className="mt-2">
                    Create an LG ThinQ Personal Access Token with device list, status, control,
                    event, push, and energy permissions. Then add
                    <code className="mx-1 rounded bg-amber-100 px-1">LG_THINQ_PAT</code>
                    to Vercel and redeploy.
                  </p>
                  <a
                    className="mt-3 inline-block font-medium underline"
                    href="https://connect-pat.lgthinq.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open LG ThinQ PAT
                  </a>
                </div>
              ) : null}

              {lgHealth?.configured ? (
                <div className="space-y-3">
                  {lgDevices.length ? (
                    lgDevices.map((device) => {
                      const isAirConditioner = device.deviceType === LG_AIR_CONDITIONER_TYPE;
                      return (
                        <div key={device.deviceId} className="glass-panel rounded-3xl p-5 sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {isAirConditioner ? <AirVent size={18} /> : <Power size={18} />}
                                <h3 className="font-semibold">
                                  {device.alias || device.modelName || "LG ThinQ device"}
                                </h3>
                              </div>
                              <p className="mt-1 break-all text-xs text-stone-500">{device.deviceId}</p>
                              <p className="text-xs text-stone-500">
                                {device.deviceType} · {device.modelName || "Unknown model"}
                              </p>
                            </div>
                            {isAirConditioner ? (
                              <button
                                aria-label={`Toggle ${device.alias || "LG air conditioner"}`}
                                className={`h-9 w-16 rounded-full p-1 transition disabled:cursor-wait disabled:opacity-60 ${
                                  lgAcState[device.deviceId] ? "bg-sky-600" : "bg-stone-300"
                                }`}
                                disabled={lgPending.has(device.deviceId)}
                                onClick={() => toggleLgAirConditioner(device)}
                              >
                                <span
                                  className={`block h-7 w-7 rounded-full bg-white transition ${
                                    lgAcState[device.deviceId] ? "translate-x-7" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <LgActionButton
                              icon={<Gauge size={14} />}
                              label="Status"
                              pending={lgPending.has(`${device.deviceId}:status`)}
                              onClick={() => loadLgStatus(device)}
                            />
                            <LgActionButton
                              icon={<Radio size={14} />}
                              label="Event +"
                              pending={lgPending.has(`${device.deviceId}:event-on`)}
                              onClick={() => updateLgSubscription(device, "event", true)}
                            />
                            <LgActionButton
                              icon={<Radio size={14} />}
                              label="Event −"
                              pending={lgPending.has(`${device.deviceId}:event-off`)}
                              onClick={() => updateLgSubscription(device, "event", false)}
                            />
                            <LgActionButton
                              icon={<Bell size={14} />}
                              label="Push +"
                              pending={lgPending.has(`${device.deviceId}:push-on`)}
                              onClick={() => updateLgSubscription(device, "push", true)}
                            />
                            <LgActionButton
                              icon={<Bell size={14} />}
                              label="Push −"
                              pending={lgPending.has(`${device.deviceId}:push-off`)}
                              onClick={() => updateLgSubscription(device, "push", false)}
                            />
                            <LgActionButton
                              icon={<Power size={14} />}
                              label="Energy"
                              pending={lgPending.has(`${device.deviceId}:energy`)}
                              onClick={() => loadLgEnergy(device)}
                            />
                          </div>

                          {lgDetails[device.deviceId] ? (
                            <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-stone-950/95 p-4 text-xs text-stone-100 shadow-inner">
                              {JSON.stringify(lgDetails[device.deviceId], null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="glass-panel rounded-3xl p-5 text-sm text-stone-500">
                      No LG ThinQ devices were returned.
                    </div>
                  )}

                  {lgDetails.subscriptions ? (
                    <div className="glass-panel rounded-3xl p-5 sm:p-6">
                      <h3 className="mb-3 font-semibold">Subscription status</h3>
                      <pre className="max-h-72 overflow-auto rounded-2xl bg-stone-950/95 p-4 text-xs text-stone-100 shadow-inner">
                        {JSON.stringify(lgDetails.subscriptions, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {signedIn && activeTab === "Settings" ? (
            <div className="glass-panel rounded-3xl p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Settings size={18} />
                <h2 className="font-semibold">Settings</h2>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {settings
                  ? Object.entries(settings).map(([key, value]) => (
                      <div key={key} className="border-t border-stone-100 pt-3">
                        <dt className="text-stone-500">{key}</dt>
                        <dd className="break-all font-medium">{value || "-"}</dd>
                      </div>
                    ))
                  : null}
              </dl>
            </div>
          ) : null}

          {signedIn && activeTab === "Logs" ? (
            <div className="glass-panel rounded-3xl p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <TerminalSquare size={18} />
                <h2 className="font-semibold">Logs</h2>
              </div>
              <div className="space-y-2">
                {logs.map((entry) => (
                  <div key={`${entry.timestamp}-${entry.message}`} className="rounded-2xl border border-white/80 bg-white/55 px-4 py-3 text-sm shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium uppercase text-stone-700">{entry.level}</span>
                      <time className="text-xs text-stone-500">{new Date(entry.timestamp).toLocaleString()}</time>
                    </div>
                    <p className="mt-1 break-words text-stone-700">{entry.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="mb-2 flex items-center gap-2 text-stone-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-stone-950">{value}</p>
    </div>
  );
}

function LightRow({
  device,
  checked,
  disabled,
  onToggle,
}: {
  device: Device;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/55 px-4 py-3 shadow-sm">
      <div>
        <p className="font-medium">{device.displayName}</p>
        <p className="text-xs text-stone-500">{device.deviceId}</p>
      </div>
      <button
        aria-label={`Toggle ${device.displayName}`}
        className={`h-8 w-14 rounded-full p-1 transition disabled:cursor-wait disabled:opacity-60 ${
          checked ? "bg-amber-400 shadow-md shadow-amber-400/25" : "bg-stone-300/90"
        }`}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className={`block h-6 w-6 rounded-full bg-white transition ${checked ? "translate-x-6" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function LgActionButton({
  icon,
  label,
  pending,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/65 px-3.5 py-2 text-xs font-medium shadow-sm hover:bg-white disabled:cursor-wait disabled:opacity-50"
      disabled={pending}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function isDeviceOn(device: Device) {
  const status = String(device.operation?.status ?? "").toLowerCase();
  return status === "on" || status === "1" || status === "true";
}

function findNestedValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (key in record) return record[key];
  for (const item of Object.values(record)) {
    const found = findNestedValue(item, key);
    if (found !== undefined) return found;
  }
  return undefined;
}
