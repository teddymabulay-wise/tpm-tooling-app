import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getOmneaEnvironment,
  getOmneaEnvironmentConfig,
  setOmneaEnvironment,
  type OmneaEnvironment,
} from "@/lib/omnea-environment";
import { OmneaEnvironmentContext } from "@/components/omnea-environment-context";

export function OmneaEnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<OmneaEnvironment>(() => getOmneaEnvironment());

  useEffect(() => {
    const handleEnvironmentChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ environment?: OmneaEnvironment }>;
      setEnvironmentState(customEvent.detail?.environment === "production" ? "production" : "qa");
    };

    window.addEventListener("omnea-environment-changed", handleEnvironmentChange);
    return () => window.removeEventListener("omnea-environment-changed", handleEnvironmentChange);
  }, []);

  const value = useMemo(() => {
    const config = getOmneaEnvironmentConfig(environment);

    return {
      environment,
      label: config.label,
      apiBaseUrl: config.apiBaseUrl,
      setEnvironment: (nextEnvironment: OmneaEnvironment) => {
        setOmneaEnvironment(nextEnvironment);
        setEnvironmentState(nextEnvironment);
      },
    };
  }, [environment]);

  return (
    <OmneaEnvironmentContext.Provider value={value}>
      {children}
    </OmneaEnvironmentContext.Provider>
  );
}

