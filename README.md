# Toastmaster – sammenlign bryllupstaler

Simpel webapp, der finder gentagne historier og jokes på tværs af 2–6 danske bryllupstaler – også når de er formuleret forskelligt.

Man vælger mellem to AI-muligheder:

**Lokal AI (standard, privat)**
- AI'en (Qwen3-4B, kvantiseret `q4f16_1`, eller `q4f32_1` hvis GPU'en ikke understøtter shader-f16) kører lokalt i browseren via [WebLLM](https://github.com/mlc-ai/web-llm) og WebGPU i en Web Worker.
- Ingen backend, login eller API-kald. Taletekster forlader aldrig browseren og gemmes ikke. Kun modelfilerne hentes (ca. 2–3 GB fra Hugging Face første gang) og caches i browseren.
- Kræver en browser med WebGPU (fx nyere Chrome/Edge på desktop) og ca. 3,5–4,5 GB grafikhukommelse.

**ChatGPT (valgfri, mere præcis)**
- Brugeren logger ind med sin egen ChatGPT Plus/Pro-konto via [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source), og analysen bruger af brugerens egen plan.
- Virker kun, når appen kører lokalt (`npm run dev` på `http://127.0.0.1:1455`). OpenAI's API sender ikke CORS-headere på svar til ChatGPT-plan-tokens, så Vite-serveren på brugerens egen computer videresender kaldene. Talerne går dermed fra brugerens computer direkte til OpenAI's Responses API (`store: false`) – aldrig via en server hos os.
- Login-callbacken skal være `http://127.0.0.1:1455/auth/callback`, som er den eneste adresse, OpenAI tillader.
- På den hostede udgave kan man kun bruge den lokale AI. Hostede apps skal ansøge OpenAI via [interesseformularen](https://openai.com/form/sign-in-with-chatgpt-interest/).

## Sådan virker det

Hver tale deles i korte afsnit. Modellen citerer en kort sætning fra hver tale, og appen finder selv det tilsvarende originale afsnit – så de viste uddrag altid er talernes egen tekst. Den lokale model sammenligner talerne parvis og dobbelttjekker hvert fund; ChatGPT får alle taler i ét kald.

## Udvikling

```sh
npm install
npm run dev     # udviklingsserver på http://127.0.0.1:1455
npm run build   # statisk build i dist/
```

Kan deployes som statisk site på Vercel (Vite registreres automatisk; output: `dist`).
