import { useEffect, useState } from "react";
import { services } from "../config/env";

type Status = "checking" | "ready" | "not_ready" | "unreachable";

const LABEL: Record<Status, string> = {
  checking: "Checking…",
  ready: "Ready",
  not_ready: "Not ready",
  unreachable: "Unreachable",
};

const BADGE: Record<Status, string> = {
  checking: "bg-slate-100 text-slate-700",
  ready: "bg-green-100 text-green-800",
  not_ready: "bg-amber-100 text-amber-900",
  unreachable: "bg-red-100 text-red-800",
};

async function checkService(url: string, signal: AbortSignal): Promise<Status> {
  try {
    const res = await fetch(`${url}/health/ready`, { signal });
    return res.ok ? "ready" : "not_ready";
  } catch {
    // Network error, CORS rejection, or service down: the browser cannot tell these apart.
    return "unreachable";
  }
}

// Developer page: verifies each backend is up AND allows this origin via CORS.
export function StatusPage() {
  const [statuses, setStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(services.map((s) => [s.name, "checking" as Status])),
  );

  useEffect(() => {
    const controller = new AbortController();
    for (const service of services) {
      void checkService(service.url, AbortSignal.any([controller.signal, AbortSignal.timeout(3000)])).then(
        (status) => {
          if (!controller.signal.aborted) setStatuses((prev) => ({ ...prev, [service.name]: status }));
        },
      );
    }
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="status-title" className="space-y-4">
      <h1 id="status-title" className="text-2xl font-bold">
        System status
      </h1>
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className="py-2">
              Service
            </th>
            <th scope="col" className="py-2">
              URL
            </th>
            <th scope="col" className="py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => {
            const status = statuses[service.name] ?? "checking";
            return (
              <tr key={service.name} className="border-b border-slate-100">
                <td className="py-2 font-medium">{service.name}</td>
                <td className="py-2 font-mono text-xs text-slate-600">{service.url}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>
                    {LABEL[status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
