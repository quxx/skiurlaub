# Sicherheit und Datenschutz: Entwurf

Stand 17.11.2026: Eigene App-Anmeldung und native Keystore-Sitzungen sind lokal
implementiert und getestet; produktive Anbindung ist offen. Details und
Prüfgrenzen: [Phase 3](phase-3-auth-decision.md). Die folgenden Regeln für
GPS, Providerverknüpfung und Gruppenfreigaben bleiben zukünftige Anforderungen.

Eigene zufällige Sessions, nur Hash in D1, Rotation nach Anmeldung,
Ablauf (30 Tage Leerlauf, täglich verlängerbar, hart 90 Tage ab Anmeldung) und Widerruf bei Logout. Browsercookie Secure/HttpOnly/SameSite;
Origin-/CSRF-Prüfung für schreibende Cookie-Anfragen. Android-Sitzungen separat
widerrufbar und Keystore-gestützt speichern. CORS nur zugelassene Origins.
OTP kurzlebig, einmalig, gehasht, versuchsbegrenzt; neutrale Antworten gegen
Account-Ermittlung. Rate Limits pro Konto und IP, keine Geheimnisse in URLs.
Provider-Zugangsdaten authentifiziert verschlüsseln; Schlüssel als Worker Secret,
Schlüsselversion/Rotation vorsehen. LocalStorage ist kein Tokenspeicher.

Alle API-Ressourcen: Session → aktuelle Mitgliedschaft → Ressourceneigentum
und Freigabe. Gruppenaustritt entzieht serverseitigen Zugriff sofort;
Mitgliedschaft nicht allein aus alten Tokenclaims ableiten. Adminoperationen
zusätzlich rollenprüfen. Einladungscode ist ein begrenztes Beitrittsgeheimnis,
kein Zugangstoken; nur Hash speichern, Ablauf/Widerruf prüfen, Einlösen atomar.
Einladung allein erzeugt keine Sitzung. Keine Gruppendaten in öffentlichen Caches.

Freigabedialog erklärt neue und historische Daten sowie volle GPS-Routen getrennt.
Nach Austritt Freigaben entfernen, Query-/Persistenzcache beim Reconnect löschen.
Bereits heruntergeladene Offlinekopien können nicht sicher sofort zurückgerufen
werden; dies muss vor Zustimmung sichtbar sein. Offline weder Gruppenbeitritt
noch Änderungen von Berechtigungen zulassen.

Tests: fremde IDs, fremde Gruppe, widerrufene Session/Einladung, abgelaufener Code,
Race beim Einlösen, Ex-Mitglied, letzter Admin, private E-Mail/Ticketkennung in DTOs,
CSRF und CORS. Logs nur bereinigte Ereignisse und Korrelations-IDs.

Export, Löschen und Aufbewahrung für Nutzer, Tracks, Imports und Backups vor
Produktivbetrieb festlegen; Löschung über D1 und Objektspeicher nachverfolgbar.
Keine rechtliche Freigabe aus dieser technischen Planung ableiten.
