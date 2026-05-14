# TPM Tooling App

TPM Tooling App is a TypeScript React application for managing Omnea and supplier tooling workflows. It includes:

- an Omnea API explorer with dynamic path parameters and query handling
- supplier contact retrieval and cross-supplier aggregation
- a dedicated batch user update form for Omnea `/v1/users/batch`
- materiality checks, supplier audits, and BSP user-supplier mapping support

## Local development

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

The app runs on `http://localhost:5173` by default.

## Build

```sh
npm run build
npm run preview
```

## Testing

```sh
npm run test
```

## Project details

This repository contains a Vite-powered React application with a focus on TPM tooling, Omnea integration, and supplier lifecycle workflows.

## Technology stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn-ui
- React Router
- Zod
