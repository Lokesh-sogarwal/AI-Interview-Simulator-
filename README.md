This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Requirements (Strict)

- Node.js: 22 LTS recommended (supported: 20.x / 21.x / 22.x)

If you use `nvm`:

```bash
nvm install
nvm use
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Production

```bash
npm run build
npm start
```

## AI Provider Configuration

This app can generate interview questions and end-of-interview feedback using an LLM.

- **Preferred (Hugging Face Inference API)**: set `HUGGINGFACE_API_KEY`.
- **Fallback (OpenAI)**: set `OPENAI_API_KEY`.

If both are set, the app will **prefer Hugging Face**.

Add to `.env.local`:

```bash
# Hugging Face (recommended)
HUGGINGFACE_API_KEY=your_hf_token
# Optional: choose a chat/instruct model hosted on Hugging Face
HUGGINGFACE_MODEL=mistralai/Mistral-7B-Instruct-v0.3

# OpenAI (optional fallback)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# AI-Interview-Simulator-
