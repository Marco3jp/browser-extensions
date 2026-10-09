export interface Env {
  key: string;
  label: string;
  color: string;
  hostPattern: string;
  hostTemplate: string;
  downgradeToHttp?: boolean;
}

export interface EnvironmentSet {
  id: string;
  name: string;
  environments: Env[];
}

export interface HostSlot {
  setId: string;
  envKey: string;
  value: string;
  lastUsedAt: number;
}

export interface TemplateUrl {
  id: string;
  setId: string;
  label: string;
  path: string;
  memo: string;
  tags: string[];
  updatedAt: number;
}
