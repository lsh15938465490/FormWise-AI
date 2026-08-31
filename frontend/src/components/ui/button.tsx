import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    outline: "border border-border bg-white hover:bg-muted",
    ghost: "hover:bg-muted",
    danger: "bg-destructive text-white hover:opacity-90",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}
