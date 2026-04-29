// Tailwind v4 ships its PostCSS plugin under @tailwindcss/postcss.
// No autoprefixer needed — v4 handles vendor prefixes via Lightning CSS.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
