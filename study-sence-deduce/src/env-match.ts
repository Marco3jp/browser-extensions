import type { Env, EnvironmentSet } from "./types";

interface HostPort {
  host: string;
  port: string;
}

function splitHostPort(s: string): HostPort {
  const i = s.lastIndexOf(":");
  if (i < 0) return { host: s, port: "" };
  return { host: s.slice(0, i), port: s.slice(i + 1) };
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, ".").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + "$");
}

export function matchEnv(url: URL, env: Env): boolean {
  const pattern = splitHostPort(env.hostPattern);
  const hostRe = wildcardToRegex(pattern.host);
  if (!hostRe.test(url.hostname)) return false;
  if (pattern.port === "") return true;
  const actualPort = url.port || defaultPortFor(url.protocol);
  const portRe = wildcardToRegex(pattern.port);
  return portRe.test(actualPort);
}

function defaultPortFor(protocol: string): string {
  if (protocol === "https:") return "443";
  if (protocol === "http:") return "80";
  return "";
}

export interface MatchResult {
  set: EnvironmentSet;
  env: Env;
}

export function findEnvForUrl(url: URL, sets: EnvironmentSet[]): MatchResult | null {
  for (const set of sets) {
    for (const env of set.environments) {
      if (matchEnv(url, env)) return { set, env };
    }
  }
  return null;
}

export function hasHostTemplateVar(env: Env): boolean {
  return env.hostTemplate.includes("*");
}

export function expandHostTemplate(template: string, value: string): string {
  return template.replace(/\*/g, value);
}

export function switchUrl(url: URL, toEnv: Env, slotValue?: string): string {
  const expanded = hasHostTemplateVar(toEnv)
    ? expandHostTemplate(toEnv.hostTemplate, slotValue ?? "")
    : toEnv.hostTemplate;
  const target = splitHostPort(expanded);
  const next = new URL(url.toString());
  if (toEnv.downgradeToHttp && next.protocol === "https:") {
    next.protocol = "http:";
  }
  next.hostname = target.host;
  next.port = target.port;
  return next.toString();
}

export function buildUrlFromTemplate(env: Env, pathQueryHash: string, slotValue?: string, protocol = "https:"): string {
  const expanded = hasHostTemplateVar(env)
    ? expandHostTemplate(env.hostTemplate, slotValue ?? "")
    : env.hostTemplate;
  const target = splitHostPort(expanded);
  const effectiveProtocol = env.downgradeToHttp ? "http:" : protocol;
  const u = new URL(effectiveProtocol + "//" + target.host + (target.port ? ":" + target.port : "") + "/");
  const tmp = new URL(pathQueryHash, u);
  return tmp.toString();
}
