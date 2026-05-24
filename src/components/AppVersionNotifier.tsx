import { useAppVersionCheck } from "@/hooks/useAppVersionCheck";

/** Renders nothing; polls for new deploys and shows a refresh toast. */
export function AppVersionNotifier() {
  useAppVersionCheck();
  return null;
}
