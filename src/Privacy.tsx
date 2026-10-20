const REPO = 'https://github.com/nicklashn/toastmaster'

export function Privacy() {
  return (
    <footer>
      <details>
        <summary>Privatliv og ansvar</summary>
        <h3>Kort fortalt</h3>
        <p>
          Toastmaster er et gratis <a href={REPO}>open source-projekt</a>. Vi har ingen server, database, brugerkonti,
          sporing eller statistik. Talerne bliver aldrig sendt til os og gemmes ikke.
        </p>

        <h3>Lokal AI</h3>
        <p>
          Talerne bliver i din browser. Første gang henter browseren AI-modellen (Qwen3-4B) fra Hugging Face, som
          derfor ser din IP-adresse som ved ethvert download. Modellen gemmes i browserens cache, så den ikke skal hentes
          igen.
        </p>

        <h3>ChatGPT (valgfrit)</h3>
        <p>
          Vælger du ChatGPT, sendes talerne fra din computer direkte til OpenAI under din egen ChatGPT-konto. Det sker
          efter OpenAI's <a href="https://openai.com/policies/row-privacy-policy/">privatlivspolitik</a> og vilkår,
          mellem dig og OpenAI. Svaret gemmes ikke som en samtale hos OpenAI. Talerne kan indeholde andres tekst og
          personlige oplysninger – del dem kun, hvis talerne er indforstået.
        </p>

        <h3>Hosting og lagring i browseren</h3>
        <p>
          Siden hostes hos <a href="https://vercel.com/legal/privacy-policy">Vercel</a>, som – ligesom enhver
          webserver – registrerer tekniske oplysninger som IP-adresse i sine logfiler. I din browser gemmes kun det,
          der skal til for at appen virker: AI-modellen, et tilfældigt id til ChatGPT-login samt dit ChatGPT-login
          (det slettes, når du lukker fanen eller logger ud). Du kan slette det hele under browserens indstillinger
          for webstedsdata.
        </p>

        <h3>Ansvar</h3>
        <p>
          Værktøjet leveres, som det er, uden garanti (<a href={`${REPO}/blob/main/LICENSE`}>MIT-licens</a>). AI'en kan
          tage fejl – brug resultatet som inspiration, ikke som facitliste. Spørgsmål: opret et{' '}
          <a href={`${REPO}/issues`}>issue på GitHub</a>.
        </p>
      </details>
    </footer>
  )
}
