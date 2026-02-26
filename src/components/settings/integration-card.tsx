"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconSpinner } from "@/components/icons";

type ActionVariant = "default" | "outline" | "ghost";

type ActionConfig = {
  label: string;
  onClick: () => void;
  variant?: ActionVariant;
  disabled?: boolean;
  loading?: boolean;
};

type IntegrationCardProps = {
  logoSrc: string;
  logoAlt: string;
  title: string;
  description: string;
  isConnected: boolean | null;
  providerName?: string;
  primaryAction: ActionConfig;
  secondaryAction?: ActionConfig;
  tertiaryAction?: ActionConfig;
  statusText?: string | null;
  children?: ReactNode;
};

export function IntegrationCard({
  logoSrc,
  logoAlt,
  title,
  description,
  isConnected,
  providerName,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  statusText,
  children,
}: IntegrationCardProps) {
  return (
    <Card className="h-full rounded-2xl border-border/50 bg-card/60 text-card-foreground shadow-[0_18px_45px_rgba(0,0,0,0.45)] transition hover:border-border hover:shadow-[0_22px_60px_rgba(0,0,0,0.6)]">
      <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <img
              src={logoSrc}
              alt={logoAlt}
              className="h-8 w-auto shrink-0 object-contain"
            />
            <div className="space-y-1">
              <div className="text-sm font-semibold leading-tight">{title}</div>
              <div className="max-w-xs text-xs text-muted-foreground">
                {description}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant={primaryAction.variant ?? "outline"}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.loading ? (
                <>
                  <IconSpinner className="mr-2 h-4 w-4" />
                  {primaryAction.label}
                </>
              ) : (
                primaryAction.label
              )}
            </Button>
            {secondaryAction ? (
              <Button
                type="button"
                variant={secondaryAction.variant ?? "ghost"}
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.loading ? (
                  <>
                    <IconSpinner className="mr-2 h-4 w-4" />
                    {secondaryAction.label}
                  </>
                ) : (
                  secondaryAction.label
                )}
              </Button>
            ) : null}
            {tertiaryAction ? (
              <Button
                type="button"
                variant={tertiaryAction.variant ?? "default"}
                disabled={tertiaryAction.disabled}
                onClick={tertiaryAction.onClick}
              >
                {tertiaryAction.loading ? (
                  <>
                    <IconSpinner className="mr-2 h-4 w-4" />
                    {tertiaryAction.label}
                  </>
                ) : (
                  tertiaryAction.label
                )}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          {isConnected && (
            <div className="text-xs">
              <span className="font-medium text-emerald-500">
                Connected
              </span>{" "}
              to {providerName || title}
            </div>
          )}
          {statusText && (
            <div className="text-xs text-muted-foreground">{statusText}</div>
          )}
          {children && (
            <div className="mt-1 text-xs text-muted-foreground">{children}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

