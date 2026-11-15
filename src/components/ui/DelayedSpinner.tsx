import { useState, useEffect } from "react";

export function DelayedSpinner({
  delay = 500,
  size,
  stroke,
  speed,
  color,
}: {
  delay?: number;
  size: string;
  stroke: string;
  speed: string;
  color: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  if (!show) return null;
  return (
    <l-tail-spin size={size} stroke={stroke} speed={speed} color={color} />
  );
}
