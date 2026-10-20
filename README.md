# Toastmaster – sammenlign bryllupstaler

Simpel webapp, der finder gentagne historier og jokes på tværs af 2–6 danske bryllupstaler – også når de er formuleret forskelligt.

- AI'en (Qwen3-4B, kvantiseret `q4f16_1`, eller `q4f32_1` hvis GPU'en ikke understøtter shader-f16) kører lokalt i browseren via [WebLLM](https://github.com/mlc-ai/web-llm) og WebGPU i en Web Worker.
- Ingen backend, login eller API-kald. Taletekster forlader aldrig browseren og gemmes ikke. Kun modelfilerne hentes (ca. 2–3 GB fra Hugging Face første gang) og caches i browseren.
- Kræver en browser med WebGPU (fx nyere Chrome/Edge på desktop) og ca. 3,5–4,5 GB grafikhukommelse.

## Sådan virker det

Hver tale deles i korte nummererede uddrag. Modellen sammenligner talerne parvis og svarer med JSON, der peger på uddrags-id'er, så de viste tekstuddrag altid er de originale.

## Udvikling

```sh
npm install
npm run dev     # udviklingsserver
npm run build   # statisk build i dist/
```

Kan deployes som statisk site på Vercel (Vite registreres automatisk; output: `dist`).
