/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        background: "hsl(210 20% 98%)",
        foreground: "hsl(222 47% 11%)",
        muted: "hsl(210 20% 96%)",
        "muted-foreground": "hsl(215 16% 47%)",
        primary: "hsl(221 83% 53%)",
        "primary-foreground": "hsl(0 0% 100%)",
        card: "hsl(0 0% 100%)",
        destructive: "hsl(0 72% 51%)",
      },
      borderRadius: {
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
    },
  },
  plugins: [],
};
