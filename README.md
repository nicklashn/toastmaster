# Toastmaster – sammenlign bryllupstaler

Simpel webapp, der finder gentagne historier og jokes på tværs af 2–6 danske bryllupstaler – også når de er formuleret forskelligt.

Man vælger mellem to AI-muligheder:

**Lokal AI (standard, privat)**
- AI'en (Qwen3-4B, kvantiseret `q4f16_1`, eller `q4f32_1` hvis GPU'en ikke understøtter shader-f16) kører lokalt i browseren via [WebLLM](https://github.com/mlc-ai/web-llm) og WebGPU i en Web Worker.
- Ingen backend, login eller API-kald. Taletekster forlader aldrig browseren og gemmes ikke. Kun modelfilerne hentes (ca. 2–3 GB fra Hugging Face første gang) og caches i browseren.
- Kræver en browser med WebGPU (fx nyere Chrome/Edge på desktop) og ca. 3,5–4,5 GB grafikhukommelse.

**ChatGPT (valgfri, mere præcis)**
- Brugeren logger ind med sin egen ChatGPT Plus/Pro-konto via [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source), og analysen bruger af brugerens egen plan.
- OpenAI's API sender ikke CORS-headere på svar til ChatGPT-plan-tokens, så kaldene går via appens egen adresse (`/openai/v1/…`): lokalt videresender Vite-serveren dem, og på Vercel gør funktionen [api/openai.ts](api/openai.ts). Den tillader kun `GET /v1/models` og `POST /v1/responses`, videresender kun brugerens egen token og gemmer/logger intet.
- OpenAI tillader kun login-callbacken `http://127.0.0.1:1455/auth/callback`. Lokalt (`npm run dev`) sker login automatisk; på den hostede udgave kopierer brugeren adressen fra login-vinduet ind i appen.
- Bemærk: OpenAI's selvbetjening for open source gælder "open-source and locally hosted apps"; hostede apps henvises til [interesseformularen](https://openai.com/form/sign-in-with-chatgpt-interest/). Den hostede ChatGPT-mulighed bruges altså uden for den beskrevne ordning, og OpenAI kan lukke for den.

## Sådan virker det

Hver tale deles i korte afsnit. Modellen citerer en kort sætning fra hver tale, og appen finder selv det tilsvarende originale afsnit – så de viste uddrag altid er talernes egen tekst. Den lokale model sammenligner talerne parvis og dobbelttjekker hvert fund; ChatGPT får alle taler i ét kald.

## Udvikling

```sh
npm install
npm run dev     # udviklingsserver på http://127.0.0.1:1455
npm run build   # statisk build i dist/
```

Kan deployes som statisk site på Vercel (Vite registreres automatisk; output: `dist`).

## Licens

[MIT](LICENSE). Appen henter ved brug AI-modellen [Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B) (Apache 2.0) i WebLLM-format fra Hugging Face og bruger [WebLLM](https://github.com/mlc-ai/web-llm) (Apache 2.0). Modelfilerne er ikke en del af dette repo.

## Privatliv

Se "Privatliv og ansvar" nederst i appen ([src/Privacy.tsx](src/Privacy.tsx)).
