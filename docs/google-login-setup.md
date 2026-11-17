# Google-Anmeldung für Android

Stand 17.11.2026: Implementiert und lokal mit signierten Testnachweisen geprüft.
Die Google-Client-IDs sind eingetragen. Das Backend ist unter
`https://skiurlaub-api.kroniq-caps.workers.dev` veröffentlicht und auf dem Handy
konfiguriert. Die neue D1-Datenbank `skiurlaub-db` hat die ID
`fd0abcc4-c629-4fd0-b6ad-caf2b209a3ac`; beide Migrationen sind angewandt.
Das Auth-Secret wurde zufällig erzeugt und ausschließlich als Cloudflare-Secret
gespeichert. Die Empfängerfreigabe liegt ebenfalls als Secret im Worker.
Andere Projekte wurden nicht verändert. Kein kostenpflichtiger Tarif wurde
aktiviert; der bestehende Kontotarif konnte mit den OAuth-Rechten nicht gelesen werden.

Produktionskonfiguration: `apps/api/wrangler.production.jsonc`.
Die lokale, ignorierte `.env.production.local` enthält nur API-Origin und öffentliche
Web-Client-ID. Die mitgeteilte Android-Client-ID endet auf
`r7embd4hgk0nf88717tfa7kglhv3rv3e.apps.googleusercontent.com`; sie wird im Google-Projekt
über Paket und Signatur zugeordnet und gehört nicht an die Web-Client-ID-Stelle.

Live geprüft: HTTPS-Health, Google nur im nativen Transport freigegeben,
E-Mail-Code und lokaler Testmodus deaktiviert, nicht angemeldete Profilaufrufe
und gefälschte Google-Nachweise abgewiesen. APK installiert und Gerätesmoke
einschließlich sichtbarer Google-Anmeldung bestanden. Der Benutzer hat die echte
Google-Anmeldung erfolgreich abgeschlossen. Danach wurden `/me` auf dem Handy,
fehlende Sitzungsschlüssel in Bridge-Antwort und JS-Speichern sowie die erhaltene
Anmeldung nach vollständigem App-Prozessneustart erfolgreich geprüft.
Das Konto bleibt angemeldet. Logout und erneute Kontowahl mit diesem echten Konto
wurden nicht zusätzlich ausgeführt; serverseitiger Logout ist lokal getestet.

Beim Deployment hat Wrangler 4.164.0 den Worker erfolgreich hochgeladen,
ist anschließend aber an `/workers/workers/skiurlaub-api` mit 10007 gescheitert.
Die workers.dev-Freigabe wurde über die dokumentierte
[Subdomain-API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/)
gesetzt: `enabled=true`, `previews_enabled=false`. HTTPS wurde danach erfolgreich
geprüft. Bei erneutem Deployment den CLI-Fehler nicht als fehlgeschlagenen Upload
interpretieren; Routing separat prüfen. Keine Schlüssel auslesen oder protokollieren.

## Google einrichten

1. In [Google Cloud](https://console.cloud.google.com/auth/overview) ein Projekt
   auswählen oder erstellen und Google Auth Platform konfigurieren. Bei externer
   Zielgruppe zunächst Testbetrieb und erlaubte Testnutzer eintragen.
2. OAuth-Client vom Typ **Webanwendung** anlegen. Dessen öffentliche Client-ID
   wird die Audience unseres Backends. Für diesen nativen ID-Token-Ablauf ist kein
   Browser-Redirect nötig. Den Client-Secret weder in die App noch ins Repository
   übernehmen.
3. Im selben Projekt einen **Android**-OAuth-Client registrieren:
   Paket `cc.quxx.skiurlaub.debug`, SHA-1 des derzeitigen Debug-Zertifikats:
   `C2:C5:E4:79:C1:86:F7:95:83:67:88:11:FF:2F:A5:D4:59:70:46:10`.
   Für Release später eigener Client für `cc.quxx.skiurlaub` mit dessen echtem
   Signaturzertifikat. Debug-Zertifikat nicht für Release verwenden.
4. Die **Web**-Client-ID als `VITE_GOOGLE_WEB_CLIENT_ID` in die lokale
   Buildkonfiguration setzen. Android-Client-ID nicht an dieser Stelle verwenden.

Grundlage: [Android Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg)
und [Implementierung](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation).

## Cloudflare vorbereiten

Anmeldung im eigenen Terminal aus dem Repository:

```powershell
pnpm --filter @skiurlaub/api exec wrangler login
pnpm --filter @skiurlaub/api exec wrangler whoami
```

Danach die konkreten Worker- und D1-Ressourcen festlegen. Die Vorlage
`apps/api/wrangler.production.example.jsonc` ist ein Backend ohne Website-Assets
und ohne eigene Domain. Erst nach Ersetzen der Platzhalter und explizitem
Deployment die produktiven Ressourcen verwenden. Die normale `wrangler.jsonc`
bleibt für lokale Prüfungen unverändert.

Benötigte Worker-Konfiguration:

- `ENVIRONMENT=production`, `APP_ORIGIN` gleich öffentlicher HTTPS-API-Origin.
- `GOOGLE_CLIENT_ID` gleich öffentlicher **Web**-Client-ID aus Google Cloud.
- `AUTH_HMAC_SECRET`: zufälliges Secret mit mindestens 32 Zeichen, sicher über
  Wrangler Secrets setzen; wird für die bestehenden Rate Limits benötigt.
- `ALLOWED_EMAILS`: private kommaseparierte Liste erlaubter Konten als Secret.
- `DB`: D1-Binding mit beiden Migrationen `0001_identity.sql` und
  `0002_google_login.sql`. Vor Migration einer bestehenden DB Export erstellen.

`AUTH_MAILER` ist für Google nicht nötig. Ohne Maildienst bleibt E-Mail-Code
in Produktion deaktiviert. In der App `VITE_API_BASE_URL` auf dieselbe öffentliche
HTTPS-API-Origin setzen, anschließend `pnpm android:install`.

## Sicherheitsgrenzen und Abnahme

Der native Google-Kontodialog wird nur auf Tastendruck geöffnet. Eine fünf Minuten
gültige serverseitige Nonce bindet den Google-Nachweis an genau einen Login.
Der Worker prüft RS256, Googles Schlüssel, Issuer, Web-Client-Audience, Zeitangaben,
Nonce und bestätigte freigegebene E-Mail. Google-`sub` bildet die stabile Identität.
Anschließend wird eine eigene widerrufbare App-Sitzung im Android-Keystore abgelegt.
Google-Nachweis und Sitzungsschlüssel werden nicht an React zurückgegeben.
Konten mit gleicher E-Mail werden nicht automatisch mit anderen Providern verknüpft.

Die automatische E-Mail-Freigabe akzeptiert vorerst Gmail und Google Workspace.
Bei Google-Konten mit externen Adressen ist Google nicht zwingend weiterhin
maßgeblich für den Besitz der Adresse; diese brauchen einen weiteren
Bestätigungsweg. Grundlage: [Googles Serverprüfung](https://developers.google.com/identity/sign-in/android/backend-auth).

Noch am echten Backend manuell zu prüfen: Abbruch des Kontodialogs, nicht erlaubtes
Google-Konto, Logout und erneute Kontowahl. Echte Anmeldung und erhaltener Login
nach vollständigem App-Prozessneustart sind auf dem Handy bestanden.
Die 18 Oberflächentests wurden zusätzlich nach der produktiven Einrichtung erneut
ausgeführt. Ihr Build nutzt eigene leere API-/Google-Variablen und eine frische
Vorschau im Testmodus, damit lokale Tests nicht die produktive API ansprechen.
