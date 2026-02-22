import type { ReactNode } from "react";
import { XIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Alert08Props = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  secondaryActionLabel?: ReactNode;
  onSecondaryAction?: () => void;
  primaryActionLabel?: ReactNode;
  onPrimaryAction?: () => void;
  primaryActionVariant?: "default" | "secondary" | "outline";
  primaryActionDisabled?: boolean;
  secondaryActionVariant?: "default" | "secondary" | "outline" | "ghost";
  closeLabel?: string;
  onClose?: () => void;
  className?: string;
  contentClassName?: string;
  actionsClassName?: string;
};

export default function Alert08({
  icon,
  title,
  description,
  secondaryActionLabel,
  onSecondaryAction,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionVariant = "secondary",
  primaryActionDisabled = false,
  secondaryActionVariant = "outline",
  closeLabel = "Close",
  onClose,
  className,
  contentClassName,
  actionsClassName,
}: Alert08Props) {
  return (
    <Alert
      className={
        className ??
        "flex justify-between border-border/70 bg-card text-card-foreground shadow-sm"
      }>
      {icon}
      <div className={`col-start-2 flex min-w-0 flex-1 flex-col gap-3 ${contentClassName ?? ""}`}>
        <div className="flex-1 min-w-0">
          <AlertTitle className="line-clamp-none">{title}</AlertTitle>
          {description ? (
            <AlertDescription className="mt-1">{description}</AlertDescription>
          ) : null}
        </div>

        {(secondaryActionLabel || primaryActionLabel) && (
          <div className={`flex flex-wrap items-center gap-2 ${actionsClassName ?? ""}`}>
            {secondaryActionLabel && onSecondaryAction ? (
              <Button
                type="button"
                variant={secondaryActionVariant}
                size="sm"
                className="h-8 cursor-pointer rounded-md px-2"
                onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </Button>
            ) : null}

            {primaryActionLabel && onPrimaryAction ? (
              <Button
                type="button"
                variant={primaryActionVariant}
                size="sm"
                disabled={primaryActionDisabled}
                className="h-8 cursor-pointer rounded-md px-2"
                onClick={onPrimaryAction}>
                {primaryActionLabel}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {onClose ? (
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}>
          <XIcon className="size-4" />
          <span className="sr-only">{closeLabel}</span>
        </button>
      ) : null}
    </Alert>
  );
}
