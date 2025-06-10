# AI chat template

An unofficial template for ⚛️ React ⨉ ⚡️ Vite ⨉ ⛅️ Cloudflare Workers AI.

Full-stack AI chat application using Workers for the APIs (using the Cloudflare [vite-plugin](https://www.npmjs.com/package/@cloudflare/vite-plugin)) and Vite for the React application (hosted using [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)). Provides chat functionality with [Workers AI](https://developers.cloudflare.com/workers-ai/), stores conversations in the browser's [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), and uses [ai-sdk](https://sdk.vercel.ai/docs/introduction), [tailwindcss](https://tailwindcss.com/) and [workers-ai-provider](https://github.com/cloudflare/workers-ai-provider).

## Get started

Create the project using [create-cloudflare](https://www.npmjs.com/package/create-cloudflare):

```sh
npm create cloudflare@latest -- --template thomasgauvin/ai-chat-template
```

Run the project and deploy it:

```sh
cd <project-name>
npm install
npm run dev
```

```
npm run deploy
```

## What's next?

- Change the name of the package (in `package.json`)
- Change the name of the worker (in `wrangler.jsonc`)
