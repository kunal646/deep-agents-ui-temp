import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, style, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border-2 bg-transparent text-base shadow-xs transition-[color,box-shadow,border-width] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-foreground focus-visible:border-2 focus-visible:ring-0",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      style={{
        padding: '0.25rem 0.75rem',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        ...style,
      }}
      {...props}
    />
  );
}

export { Input };
