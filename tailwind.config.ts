import type { Config } from "tailwindcss";

/**
 * Design tokens live as CSS variables in src/app/globals.css (light + dark).
 * Tailwind maps semantic names to them so components never hardcode colours.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        subtle: v("subtle"),
        muted: v("muted"),
        line: v("line"),
        "line-strong": v("line-strong"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), 3: v("ink-3") },
        primary: { DEFAULT: v("primary"), fg: v("primary-fg") },
        finance: { DEFAULT: v("finance"), soft: v("finance-soft") },
        nutrition: { DEFAULT: v("nutrition"), soft: v("nutrition-soft") },
        activities: { DEFAULT: v("activities"), soft: v("activities-soft") },
        positive: { DEFAULT: v("positive"), soft: v("positive-soft") },
        negative: { DEFAULT: v("negative"), soft: v("negative-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        micro: ["11px", { lineHeight: "14px", letterSpacing: "0.04em" }],
        caption: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "22px" }],
        lg: ["18px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        xl: ["22px", { lineHeight: "28px", letterSpacing: "-0.015em" }],
        "2xl": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
        display: ["36px", { lineHeight: "40px", letterSpacing: "-0.025em" }],
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", md: "10px", lg: "14px", xl: "18px" },
      boxShadow: {
        card: "0 1px 2px rgb(20 18 14 / 0.04)",
        pop: "0 12px 32px -8px rgb(20 18 14 / 0.18), 0 2px 6px rgb(20 18 14 / 0.06)",
        focus: "0 0 0 3px rgb(var(--focus) / 0.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(6px) scale(.985)" }, to: { opacity: "1", transform: "none" } },
        "sheet-in": { from: { transform: "translateY(16px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "pop-in": "pop-in 180ms cubic-bezier(.2,.8,.2,1)",
        "sheet-in": "sheet-in 220ms cubic-bezier(.2,.8,.2,1)",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
