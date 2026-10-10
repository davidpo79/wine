"use client";

import { useEffect } from "react";

export function AutoRefresh({ seconds }: { seconds: number }) {
  useEffect(() => {
    const t = setTimeout(() => location.reload(), seconds * 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return null;
}
