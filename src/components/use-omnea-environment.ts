import { useContext } from "react";
import { OmneaEnvironmentContext } from "@/components/omnea-environment-context";

export function useOmneaEnvironment() {
  const context = useContext(OmneaEnvironmentContext);
  if (!context) {
    throw new Error("useOmneaEnvironment must be used within OmneaEnvironmentProvider");
  }

  return context;
}
