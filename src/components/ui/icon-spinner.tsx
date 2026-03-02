import * as React from "react";
import { cn } from "@/lib/utils";

export type IconSpinnerProps = React.SVGProps<SVGSVGElement>;

export const IconSpinner = React.forwardRef<SVGSVGElement, IconSpinnerProps>(
  ({ className, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        className={cn("animate-spin text-muted-foreground", className)}
        viewBox="0 0 24 24"
        aria-hidden="true"
        {...props}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
    );
  }
);

IconSpinner.displayName = "IconSpinner";

