import { useMemo } from "react";

export const useIsMounted = () => {
  const isMounted = useMemo<boolean>(() => true, []);

  return isMounted;
};