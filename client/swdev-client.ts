import type { RevalidateCommand, Command } from "../types.ts";

declare var navigator: any;

const log = (...args: any) => console.info("[swdev-client]", ...args);

async function setupServiceWorker() {
  if (navigator.serviceWorker == null) {
    throw new Error("Your browser can not use serviceWorker");
  }
  let installed = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (installed) {
      console.warn("[swdev] service-worker updated. reload it.");
    }
  });
  const reg = await navigator.serviceWorker.register("/__swdev-worker.js");
  await navigator.serviceWorker.ready;
  installed = true;
  setInterval(() => reg.update(), 60 * 1000);
}

export async function requestRevalidate(cmd: RevalidateCommand) {
  const newPaths = cmd.paths.map((u) =>
    u.startsWith("/") ? `${location.protocol}//${location.host}${u}` : u
  );

  const res = await fetch("/__swdev/revalidate", {
    method: "POST",
    body: JSON.stringify({ paths: newPaths }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    log("revalidate", newPaths);
  } else {
    log("revalidate-requested", newPaths);
  }
  return;
}

let dispose: any = null;

async function run(url: string, opts: { nocache?: boolean }) {
  const runId = opts.nocache
    ? `nocache-${Math.random()}`
    : Math.random().toString();
  log("run", runId);

  await dispose?.();
  const mod = await import(url + "?" + runId);
  dispose = mod.default();
}

let started = false;
export async function start(
  url: string,
  opts: { nocache?: boolean; onFileChange?: () => void } = {}
) {
  if (started) return;
  started = true;
  log("start");

  await setupServiceWorker();

  const onFileChange =
    opts.onFileChange ?? (() => run(url, { nocache: opts.nocache }));

  try {
    const socket = new WebSocket(`ws://localhost:17777/`);
    socket.onmessage = async (message) => {
      const cmd = JSON.parse(message.data) as Command;
      if (cmd.type === "revalidate") {
        await requestRevalidate(cmd);
        log("revalidated", cmd.paths);
        onFileChange();
      }
      // TODO: revalidate all
      if (cmd.type === "files") {
        console.log("current-files", cmd.files);
      }
    };
  } catch (err) {
    // no socket
  }

  await run(url, { nocache: opts.nocache });
}