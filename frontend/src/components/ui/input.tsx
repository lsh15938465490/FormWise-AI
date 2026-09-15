import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-white px-3 pr-9 text-sm text-foreground outline-none transition-colors hover:border-primary/40 focus:ring-2 focus:ring-primary/30 [&::-ms-expand]:hidden",
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2}
      />
    </div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("space-y-1.5 text-sm font-medium", className)} {...props} />;
}
