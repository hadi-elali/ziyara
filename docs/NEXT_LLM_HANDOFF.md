# Übergabe an die nächste LLM

Stand: 17. August 2026

Dieses Dokument beschreibt den aktuellen Arbeitsstand und die noch offenen Aufgaben. Vor weiteren Änderungen zuerst `AGENTS.md`, `LLM_CONTEXT.md` und dieses Dokument vollständig lesen.

## Wichtig: aktueller Zustand

- Im Git-Arbeitsverzeichnis liegt ein größerer, noch nicht committeter Review- und Production-Readiness-Stand. Diese Änderungen nicht verwerfen oder überschreiben.
- Die Supabase-Migrationen bis `20260817000000_allow_admin_role_assignment.sql` wurden bereits auf die verknüpfte Remote-Datenbank ausgerollt. Nicht erneut erstellen.
- Der Abschlussstand besteht `npm run validate`: TypeScript, ESLint, alle 6 Jest-Tests und der Expo-Abhängigkeitscheck sind erfolgreich.
- Der Web-Export wurde nach den letzten Änderungen erfolgreich mit 24 statischen Routen erzeugt. Expo Doctor besteht 21/21 Prüfungen.
- Die Übersetzungsprüfung ist erfolgreich: Deutsch, Englisch und Arabisch besitzen jeweils dieselben 341 Schlüssel ohne Lücken; alle 249 statisch verwendeten `t(...)`-Schlüssel sind vorhanden.
- `git diff --check` ist sauber; die Suche nach `TODO`, `FIXME`, `HACK`, `XXX`, `@ts-ignore` und `eslint-disable` in `src` und `supabase` liefert keine Treffer.
- Lokal läuft derzeit Node 23.3.0. Das Projekt ist über `.nvmrc` und `engines` auf Node 22.13.0 festgelegt; möglichst damit weiterarbeiten.

## Bereits umgesetzt

- Rollenmodell mit `user`, `medical_staff`, `organization_team` und `admin`. Nur Admins dürfen alle Rollen einschließlich `admin` vergeben; Standard ist `user`. Der letzte Admin kann nicht herabgestuft werden.
- Admins sehen weiterhin Statusabfragen und anonyme Fragerunden und können daran teilnehmen.
- Registrierung unterscheidet Bruder/Schwester und erlaubt vertretene Familienmitglieder ohne eigenes Telefon. Erwachsene mit eigenem Telefon sollen einen eigenen Account anlegen.
- Admin-Personenliste wurde auf Name, vertretene Person und Rolle reduziert; Suche und aufklappbare Rollenvergabe sind vorhanden.
- Persistenter Zustand wurde gehärtet: Laufzeitvalidierung, geteilte Stores, Schreibreihenfolge und Schutz vor veralteten Hydration-Ergebnissen.
- Suche wurde für lateinische Diakritika und arabische Zeichenvarianten verbessert; falsche Inhaltsverlinkungen und Platzhalter-IDs wurden korrigiert.
- Statusabfragen und Fragerunden verwenden Supabase Realtime mit gestaffelten Fallback-Abfragen statt aggressivem Polling. Das ist für ungefähr 100 gleichzeitige Nutzer wesentlich geeigneter.
- Veraltete Netzwerkanfragen werden abgefangen, Admin-Aktualisierungen gebündelt und anonyme Fragen in 50er-Blöcken dargestellt.
- Rollenänderungen werden in `role_assignment_audit` protokolliert und datenbankseitig serialisiert.
- Rollenänderungen werden für die betroffene offene Sitzung über Profil-Realtime beziehungsweise beim App-Fokus aktualisiert.
- Anonyme Fragen sind auf fünf Einreichungen pro Profil und Runde begrenzt. Der Zähler enthält weder Frage noch Text noch Zeitpunkt und wird beim Schließen der Runde gelöscht.
- Kritische Datenbankaktionen werden gegen gleichzeitig geschlossene Runden abgesichert.
- Fehler beim Laden von Profil/Rolle führen nicht mehr stillschweigend zu falscher Navigation, sondern zu einer Wiederholen-Ansicht.
- Nicht mehr verwendete Starter-Komponenten und direkte Abhängigkeiten wurden entfernt.
- Jest, sechs Katalogtests, CI, EAS-Konfiguration, `.nvmrc` und `supabase/seed.sql` wurden ergänzt.
- `README.md`, `LLM_CONTEXT.md` und `docs/IMPLEMENTATION_PLAN.md` wurden aktualisiert.

## Was die nächste LLM zuerst tun soll

1. Den gesamten Diff und insbesondere alle nicht committeten Dateien prüfen. Keine fremden Änderungen zurücksetzen.
2. Nach jeder weiteren Änderung unter Node 22.13.0 erneut die Abschlussprüfungen ausführen:

   ```bash
   npm run validate
   npx expo install --check
   npx expo export --platform web
   npx expo-doctor@latest
   ```

3. Bei neuen Texten erneut prüfen, dass alle Übersetzungsschlüssel in Deutsch, Englisch und Arabisch vorhanden sind.
4. Manuelle Smoke-Tests durchführen:
   - Registrierung und Login
   - Bruder/Schwester sowie Familie ohne eigenes Telefon
   - Admin-, Nutzer-, Medizinpersonal- und Organisationsteam-Konten
   - Personensuche und Rollenvergabe
   - Statusabfrage und anonyme Fragen aus allen Rollen, besonders als Admin
   - Karten auf iOS, Android und Web
   - Leseansicht, Lesezeichen und Wiederherstellung der Scrollposition
5. Nach weiteren Datenbankänderungen Supabase erneut prüfen:

   ```bash
   npx supabase migration list
   npx supabase db lint --linked
   ```

6. Niemals selbst einen Git-Commit oder Git-Push ausführen. Der Auftraggeber übernimmt sämtliche Git-Aktionen.

## Noch offene Code- und Qualitätsaufgaben

- Passwort-zurücksetzen inklusive Deep Links fehlt.
- Arabisch setzt bislang nur die Textrichtung einzelner Bereiche; vollständiges natives RTL über `I18nManager` ist noch offen.
- Es gibt noch keinen produktiven Fehler-/Crash-Monitoringdienst.
- Die neuen Kernbereiche brauchen mehr Tests, insbesondere persistente Stores, Auth-/Rollenschutz, Realtime-Verhalten und das Fragenlimit.
- Native End-to-End-Tests und ein Lasttest mit etwa 100 Geräten beziehungsweise simulierten Clients fehlen.
- Offline-Verfügbarkeit nativer Kartenkacheln ist nicht garantiert.
- `medical_staff` und `organization_team` haben absichtlich dieselben Berechtigungen wie normale Nutzer. Keine zusätzlichen Rechte erfinden; zuerst mit dem Auftraggeber klären.

## Externe Release-Blocker

Diese Punkte können nicht sinnvoll ohne Angaben oder Freigabe des Auftraggebers abgeschlossen werden:

- App-Icon, Splashscreen und Adaptive Icon sind noch Expo-Startergrafiken und müssen durch freigegebene Marken-Assets ersetzt werden.
- iOS `bundleIdentifier`, Android `package`, finale Versionsnummern und Signing fehlen.
- Datenschutzseite, Supportseite und Store-Metadaten fehlen beziehungsweise brauchen rechtliche Freigabe.
- Alle 19 Orte, acht von neun Handlungen und vier von fünf religiösen Einträgen sind noch als `needs_review` markiert; Ziyarat Ashura ist als `verified` freigegeben.
- Der vollständige arabische Text und die Transliteration von Ziyarat Ashura stehen auf `pending_rights_review`. Fachliche religiöse Prüfung und Rechteklärung sind zwingend.
- Supabase-Projektplan und Produktionseinstellungen prüfen: E-Mail-Bestätigung, Redirect-URLs, Signup-Schutz/CAPTCHA, Rate Limits, Backups und gegebenenfalls PITR.
- Reale Tests auf iOS und Android sowie unter schwacher Reiseverbindung stehen aus.

## Sicherheit und Abhängigkeiten

`npm audit` meldete zuletzt 23 transitive Schwachstellen (15 hoch, 8 moderat) aus der Expo-/Metro-Werkzeugkette, hauptsächlich `image-size` und `xcode/uuid`. `npm audit fix --force` nicht ausführen: Der vorgeschlagene Fix würde auf Expo 53 beziehungsweise React Native 0.72 zurückstufen. Stattdessen kompatible Expo-SDK-Updates beobachten. Der produktionsnahe CI-Grenzwert `npm audit --omit=dev --audit-level=critical` war erfolgreich; der letzte erneute Abruf konnte wegen DNS-/Registry-Nichterreichbarkeit nicht aktualisiert werden.

## Datenbankstatus

Die Remote-Datenbank ist bis einschließlich Migration `20260817000000` synchron. Migration List und Remote-Lint wurden danach erfolgreich ausgeführt; der Lint meldet keine Schemafehler. Diese Migration erlaubt die Vergabe der Adminrolle und schützt den letzten Admin. Ein lokaler Supabase-Stack konnte nicht gestartet werden, weil Docker nicht lief; `supabase/seed.sql` ist vorhanden.

## Definition für die nächste Übergabe

Die nächste LLM soll den geprüften Stand bewahren, nach eigenen Änderungen die Abschlussprüfungen wiederholen, gefundene Fehler beheben und klar zwischen Codeaufgaben und Aufgaben unterscheiden, die Freigaben, Inhalte, Zugangsdaten oder Geräte des Auftraggebers benötigen.
