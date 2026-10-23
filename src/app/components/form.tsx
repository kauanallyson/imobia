"use client";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Field(props: { label: string; name: string } & TextFieldProps) {
  return <TextField required fullWidth {...props} />;
}

export function SubmitButton({
  pending,
  icon: Icon,
  children,
}: {
  pending?: boolean;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant="contained"
      size="large"
      disableElevation
      disabled={pending}
      startIcon={
        pending ? (
          <CircularProgress size={18} color="inherit" />
        ) : (
          <Icon aria-hidden size={20} />
        )
      }
    >
      {children}
    </Button>
  );
}
