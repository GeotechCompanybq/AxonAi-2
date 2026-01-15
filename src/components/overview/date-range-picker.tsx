"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | undefined;
  onChange: (v: DateRange | undefined) => void;
}) {
  const label = value?.from
    ? value.to
      ? `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`
      : `${format(value.from, "MMM d, yyyy")} – …`
    : "Pick dates";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2 rounded-xl bg-background/40 shadow-sm backdrop-blur",
            "hover:bg-background/60"
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          initialFocus
          mode="range"
          numberOfMonths={2}
          selected={value}
          onSelect={onChange}
          className="rounded-xl"
        />
      </PopoverContent>
    </Popover>
  );
}


