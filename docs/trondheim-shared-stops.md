# Trondheim: flere linjer på samme stopp

Åpne `web/linear/`, velg linje 1, 2 eller 3 og slå på «Vis alle bylinjer på disse holdeplassene».
Kartet beholder valgt linjes holdeplasser og retninger. Andre bylinjer vises bare på samme
NSR-plattform-ID, ikke fordi holdeplassnavnet eller rutenes retningsnummer ligner.
Hver buss får en oppføring med linjenummer, rutefarge, status og destinasjon.
Hoveddioden følger felles statusprioritet og veksler farger ved lik prioritet.

Den separate profilen `trondheim-shared-stops-board` inkluderer 40 katalogførte AtB-linjer
på de 147 eksisterende plattformene. Den bruker eksisterende Worker-behandling og felles
cache for AtB-kjøretøy. Én synlig side henter én frame; skjulte sider stopper polling.
Vanlig linjevisning og eksisterende fysiske tavleprofiler beholder sine feed-adresser.
Rutefargene finnes i `render.lineColors`, slik at samme farger kan brukes på fysisk tavle.

Dette er GPS-basert status innenfor tavlens eksisterende avstandsgrenser, ikke bekreftet
døråpning. Bare ruter og plattformer i katalogen omfattes; Flybussen og ukjente ruter er
ikke inkludert i denne bybussmodusen. Plattformkolonnene følger valgt linje, mens andre
linjers faktiske destinasjoner står på bussoppføringene.

Etter katalogendringer kjøres `node scripts/generate-trondheim-shared-stops.mjs`.
Verifiser med `node scripts/test-shared-stops.mjs` og de eksisterende Worker-/linjetestene.
Publisering krever både de nye profilene på GitHub Pages og Worker-endringen for rutefarger.

