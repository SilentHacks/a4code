import Constants from "expo-constants";

export const hostedAppOrigin: string | undefined =
  typeof Constants.expoConfig?.extra?.hostedAppUrl === "string"
    ? Constants.expoConfig.extra.hostedAppUrl
    : undefined;

export type MobileStageLabel = "Beta" | "Dev" | "Nightly";

export function resolveMobileStageLabel(appVariant: unknown): MobileStageLabel {
  if (appVariant === "development") return "Dev";
  if (appVariant === "preview") return "Nightly";
  return "Beta";
}
