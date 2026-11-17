# Android, NFC und Updates: Entwurf

Phase 0. Capacitor-Grundlage für NFC in Phase 5, Releaseabschluss Phase 10.
NFC-Brücke auf Verfügbarkeit, Tag-Technologien, Byte-Reihenfolge und Kodierung
testen. Karten-UID ist nicht automatisch Skiline-Chipnummer. Ergebnis zur Kontrolle
anzeigen; Registrierung verlangt Bestätigung. Web bietet manuelle Eingabe.
Plugin oder eigene native Brücke erst nach Kompatibilitäts-/Lizenzprüfung auswählen.

Release: feste Application-ID, steigender versionCode, versionName; Gradle-/JDK-/
SDK-Versionen pinnen, Lockfiles und reproduzierbare CI-Schritte dokumentieren.
Signierte APK mit Checksummen über GitHub Releases; Keystore und Passwörter nur
geschützt in CI, verschlüsseltes Offlinebackup und Wiederherstellungsprobe.
Releaseworkflow nur vertrauenswürdigen Branches/Tags erlauben, keine Secrets in
fremden PR-Builds. Konkrete Toolversionen erst vor Integration prüfen.

Updateprüfung vergleicht installierten versionCode mit freigegebenem Kanal aus
der gemeinsamen API. APK nur HTTPS aus festgelegter Quelle; Metadaten gegen
Manipulation absichern, Integrität und erwartete Signatur prüfen. Android verlangt
Installationserlaubnis/Nutzerbestätigung; kein stilles Update versprechen.
Gleiche Application-ID und Signing-Identität bei Updates beibehalten.
Offline oder fehlgeschlagene Prüfung darf die App nicht blockieren.

Vor Freigabe auf realem Gerät: Erstinstallation, Update mit Datenerhalt,
unterbrochener Download, falsche Signatur, unbekannte Quelle verweigert,
Berechtigungsentzug, NFC und GPS bei gesperrtem Display. Späteren App-Store-Kanal
separat bewerten. Noch keine APK gebaut oder signiert.
