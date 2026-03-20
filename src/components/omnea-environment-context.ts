import { createContext } from "react";
import type { OmneaEnvironment } from "@/lib/omnea-environment";

export type OmneaEnvironmentContextValue = {
  environment: OmneaEnvironment;
  label: string;
  apiBaseUrl: string;
  setEnvironment: (environment: OmneaEnvironment) => void;
};

export const OmneaEnvironmentContext = createContext<OmneaEnvironmentContextValue | null>(null);
