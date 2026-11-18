# GPS: Akku-Abnahme (Messplan)

Budget (vom Nutzer bestätigt): **höchstens 15–20 zusätzliche Prozentpunkte über 8 h Skitag**.
Das ist ein Richtwert, keine Garantie. Verfehlt ein Lauf das Budget, werden Intervalle und
Batching angepasst; das Tracking bleibt optional.

## Vorbereitung

1. Gleiches Gerät, gleiche Bedingungen: Akku ≥ 95 %, Display-Helligkeit und Mobilfunk wie am
   Skitag, gleiche Apps im Hintergrund.
2. Zwei Läufe gleicher Dauer **ohne** und **mit** Aufzeichnung vergleichen (Differenz = Mehrverbrauch).
3. Debug-APK per `pnpm android:install` oder Release (später). Aufzeichnung nur über die App starten.

## Szenarien (Master-Prompt 15)

| #   | Szenario                                 | Dauer  |
| --- | ---------------------------------------- | ------ |
| 1   | Aufzeichnung bei eingeschaltetem Display | 1 h    |
| 2   | Aufzeichnung bei gesperrtem Display      | 2 h    |
| 3   | Voller Skitag                            | 8 h    |
| 4   | Wechselnder GPS-Empfang (Gondel, Wald)   | im Tag |
| 5   | Ohne Mobilfunk                           | 1 h    |
| 6   | Energiesparmodus aktiv                   | 2 h    |
| 7   | Lange Pausen (Hütte)                     | 1 h    |

Zusätzlich: Berechtigung entziehen, App wegwischen, Prozess beenden, Speicher fast voll.

## Messwerte je Lauf

Gerät/Android-Version, Dauer, Akku vorher/nachher, Punktzahl und mittlere Genauigkeit
(Detailseite), Lücken (Warnung „große Lücken“), Unterbrechungen (Status „Unterbrochen“),
Standortnutzung laut Android.

Hilfsbefehle (Handy per USB, Entwickleroptionen an):

```text
adb shell dumpsys batterystats --reset            # vor dem Lauf
adb shell dumpsys batterystats cc.quxx.skiurlaub.debug > batterystats.txt   # danach
adb shell dumpsys location | findstr /i skiurlaub  # Standortanfragen
adb shell dumpsys battery                          # aktueller Stand
```

## Ergebnistabelle (auszufüllen)

| Lauf | Szenario | Dauer | Akku vorher → nachher | Referenz ohne Tracking | Mehrverbrauch | Punkte | Lücken | Bemerkung |
| ---- | -------- | ----- | --------------------- | ---------------------- | ------------- | ------ | ------ | --------- |
|      |          |       |                       |                        |               |        |        |           |

## Stellschrauben bei Überschreitung

Intervall im Stillstand erhöhen, Batching-Verzögerung erhöhen, Priorität `BALANCED` im Stillstand,
Aufzeichnung bei langen Pausen automatisch pausieren (nur mit Nutzerzustimmung), Barometer nur bei Bewegung.

## Erste Beobachtung (nur Funktionstest, kein Akkutest)

18.11.2026, Samsung SM-S918B, Android 17: Stillstand im Haus, Display gesperrt, 10-s-Intervall
angefordert, ca. 6 Punkte in 100 s geliefert (Batching/Stillstand). Aussage über Akkuverbrauch: keine.

## Automatisches Akku-Protokoll (nur Debug-Builds, bis zum Release)

Seit 18.11.2026 schreibt die Debug-App bei jeder Aufzeichnung den Akkustand mit: beim Start, bei
Pause/Fortsetzen, beim Beenden (oder Unterbrechen) und alle 10 Minuten dazwischen. Gespeichert werden
Zeit, Prozent, „lädt“ (ja/nein) und Akkutemperatur im Meta-Eintrag des Tracks. Im Release-Build ist
das abgeschaltet (`BuildConfig.DEBUG`), und die Anzeige verschwindet von selbst.

- **Beim Aufzeichnen** (Skitage-Tab): „Akku 87 % · Start 90 % (Test)“.
- **In der Aufzeichnung** (Detailseite): Karte „Akku (Test)“ mit Start → Ende, Punkten, Dauer, Punkten
  pro Stunde (ab 10 Minuten) und höchster Akkutemperatur. Hat das Handy zwischendurch geladen, steht
  dort ausdrücklich, dass der Wert nicht aussagekräftig ist.
- Die Auflösung ist 1 Prozentpunkt. Für das Budget (15–20 Punkte in 8 h) taugen daher nur lange Läufe;
  die Stundenrate kurzer Läufe ist grob. Für die Vergleichsmessung „ohne Tracking“ bleibt der Plan oben.
- Rohdaten: `adb shell run-as cc.quxx.skiurlaub.debug cat files/tracks/<id>.json` (Feld `battery`).
