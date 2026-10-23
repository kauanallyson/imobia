"use client";

import { createTheme } from "@mui/material/styles";

// Tema claro (branco) do loteAI.
export const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: "#ffffff", paper: "#ffffff" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "var(--font-tuffy), Roboto, sans-serif",
    button: { textTransform: "none", fontWeight: 700 },
  },
});
