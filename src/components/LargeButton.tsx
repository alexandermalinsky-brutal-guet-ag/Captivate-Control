import type { ButtonHTMLAttributes } from "react";

interface LargeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "neutral" | "positive" | "danger";
}

export function LargeButton({ tone = "neutral", className = "", ...props }: LargeButtonProps) {
  return <button className={`large-button large-button-${tone} ${className}`.trim()} {...props} />;
}
