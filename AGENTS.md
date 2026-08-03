## Overview
This project is a temp-app application.

## Command Conventions
- Install dependencies: `npm install`
- Start dev server: `npm run dev` (maps to `next dev`)
- Build for production: `npm run build` (maps to `next build`)
- Run tests: `npm run test` (maps to `echo "No test script"`)
- Lint: `npm run lint` (maps to `tsc --noEmit`)

## Coding Conventions
- Components: arrow functions, e.g. `const MyComponent = () => { ... }`
- Styling: Tailwind CSS if present, else CSS/SCSS as per project.
- No semicolons in JS/TS files.

## PR & Commit Rules
- After changes, run `npm run lint` to ensure no errors.
- Commit messages: use conventional prefixes like `feat:`, `fix:`, `docs:`, etc.
