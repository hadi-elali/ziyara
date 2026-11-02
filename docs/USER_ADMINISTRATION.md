# Benutzerverwaltung und Anmeldung

Stand: 2. November 2026.

## Bedienung

Admins öffnen **Dashboard → Benutzer**, suchen die Person und öffnen ihre Details. **Benutzer löschen** zeigt den Namen und eine ausdrückliche Bestätigung. Erst **Ja, Benutzer endgültig löschen** entfernt das Konto dauerhaft. Die Personenübersicht, Summen und Auswahlmöglichkeiten für Familien, Gruppen und Busse übernehmen die bestätigte Löschung. Eine vorhandene Kontofamilie bleibt als verwaltbarer Datensatz bestehen.

Das eigene Konto lässt sich auf diesem Adminweg nicht löschen. Die bisherige Eigenlöschung unter Konto bleibt verfügbar; der letzte Admin bleibt serverseitig geschützt. Fehlende aktuelle Adminrechte, unbekannte Konten und technische Fehler werden angezeigt, ohne die lokale Liste als erfolgreich gelöscht zu markieren.

## Bereitstellung

1. Den Migrationsstand des Zielprojekts abgleichen. Nach den bestehenden Migrationen `supabase/migrations/20261102000000_allow_admin_user_deletion.sql` anwenden. Die Migration ergänzt ausschließlich die abgesicherte RPC `admin_delete_user(p_user_id uuid)` und ihre Rechte.
2. Anschließend den aktualisierten Client ausliefern. Ein zusätzliches Function-Deployment ist nicht nötig. `app.json` deaktiviert die außerhalb des eigenen Layouts angezeigten Expo-Systemseiten über `extra.router.sitemap: false` und `extra.router.notFound: false`; eine eigene geschützte `+not-found`-Route übernimmt unbekannte Links. Wegen dieser App-Konfigurationsänderung ist gemäß Projektvorgabe ein neuer Development-/Preview-Build mit nativer Prüfung erforderlich; er wurde in diesem Auftrag nicht erstellt.
3. Auf iOS und Android mit ausdrücklich freigegebenen Testkonten den Bestätigungsabbruch, die erfolgreiche Löschung und den Login des betroffenen Geräts nach Rückkehr und Neustart prüfen. Keine echten Reisekonten als Test löschen.

Die neue Migration wurde in diesem Auftrag nicht auf einem entfernten Projekt angewandt. Nach der Router-Konfigurationsänderung den Metro-Cache löschen, etwa mit `npx expo start --clear`; Web mit `npx expo export --platform web --clear` frisch exportieren, damit kein älteres eingebettetes App-Manifest die Systemseiten wieder aktiviert.

## Zugriff und Abmeldung

Ohne gültige Anmeldung öffnet die App Login. Registrierung und Passwort-Recovery bleiben Bestandteile dieses öffentlichen Anmeldeablaufs. Tabs, Katalog, Intro, Einstellungen, Reader, Quellen, Disclaimer und Notfall-/Adminziele sind ohne Session gesperrt, auch über direkte Links und Zurücknavigation.

Die RPC prüft die Adminrolle in der Datenbank und löscht `auth.users` innerhalb derselben Transaktion wie die bisherigen Löschschutzregeln und Datenbereinigungen. Zugehörige Auth-Sessions und Refresh-Tokens werden über Fremdschlüssel entfernt. Bestehende kurzlebige JWTs werden durch eine Kontolöschung nicht kryptografisch ungültig. Deshalb prüft der Client die tatsächliche Kontoverfügbarkeit mit einem isolierten, abbrechbaren Auth-Aufruf vor dem Profilladen und entfernt eine endgültig abgelehnte lokale Session.

Ein Realtime-Löschereignis der eigenen Profil-ID startet unmittelbar eine autoritative Prüfung. Der Abgleich läuft außerdem beim Start, bei der Rückkehr in die App, im Browser bei Fokus/Online-/Sichtbarkeitswechsel und zusätzlich alle 30 Sekunden im Vordergrund. Ohne Netzwerk ist keine sofortige Kenntnis einer entfernten Löschung möglich. Netzwerkfehler erhalten die gespeicherten Zugangsdaten; beim Start bleibt der Inhalt bis zur erfolgreichen Kontoprüfung gesperrt. Ein bereits erfolgreich gestarteter Client behält bei vorübergehendem Verbindungsausfall seinen bisherigen Zustand. Nach bestätigter Löschung wird Login angezeigt.

Der Ortskatalog und die Bilder bleiben gebündelt. Diese Änderung schützt den Appzugang; sie entfernt keine bereits ausgelieferten öffentlichen Inhaltsdateien aus älteren Clients und ändert keine bestehenden öffentlichen Inhalts-Leserechte in Supabase. Ältere Clients benötigen das Update, um die neue Navigation und lokale Abmeldung zu erhalten.

## Prüfung

- 587 Jest-Tests in 68 Suites bestehen (88,51 % globale Line Coverage), einschließlich Auth-SDK, Löschdialog, Zugriffsschutz und verspäteter Antworten.
- 30 neue und 18 bestehende SQL-Assertions bestehen mit tatsächlichen App-Migrationen in isoliertem PostgreSQL/PGlite; Auth-Fremdschlüssel sind dort nachgebildet. Kein vollständiger Supabase- oder Mehrverbindungstest.
- Sauberer Web-Export mit `--clear` sowie 14 echte Chrome-Prüfungen direkter anonymer Links bestehen, einschließlich Sitemap, unbekannter Links, Start, Check-in, Reader und Notfall-Postfach.
- Lint: keine Fehler, vier vorhandene Warnungen. TypeScript: ausschließlich der bekannte Rückgabetypkonflikt in `AdminBusManagementPanel.tsx:326`. Lokaler SDK-Abgleich besteht mit Offline-Hinweis; Expo Doctor meldet sieben vorhandene Patchabweichungen (20/21 Checks).
- Vollständige lokale Supabase-/Playwright-Abläufe sind angepasst, mangels laufendem Docker/Supabase nicht ausgeführt. Native Build-/Geräteprüfung und produktive Bereitstellung stehen aus.
