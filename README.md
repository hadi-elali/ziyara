# Shia Ziyarah Iraq

Produktionsorientierte Expo-SDK-57-App für eine schiitische Ziyarah-Reise im Irak. Stand dieser Dokumentation: 30. August 2026.

Der Guide ist mit seinen Orts-, Stadt-, Karten-, Such-, Lesezeichen-, Reader-, Einstellungs-, About-, Disclaimer- und Quelleninhalten lokal gebündelt und startet ohne Anmeldung sowie ohne Supabase-Verbindung. Konto-, Tagesprogramm-, Bus-, Reisegruppen-, Generalalarm-, Reiseführungs-, Gruppencheck-, Fragerunden- und Administrationsfunktionen bleiben durch Supabase Auth, Row Level Security und serverseitig geprüfte RPCs geschützt.

## Dokumentation

- [`LLM_CONTEXT.md`](./LLM_CONTEXT.md): verbindlicher Ist-Zustand für LLMs und neue Mitwirkende
- [`AGENTS.md`](./AGENTS.md): Arbeits-, Sicherheits-, Qualitäts- und Inhaltsregeln
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md): ursprüngliche Roadmap; nicht ungeprüft als Ist-Zustand verwenden
- [`docs/GENERAL_ALARM.md`](./docs/GENERAL_ALARM.md): Push-/Scheduler-Aktivierung und verbindliche Plattformgrenzen

## Aktuell umgesetzt

### Öffentlicher Offline-Guide

- Start/Guide, native Karte beziehungsweise Web-Fallback, Suche, Lesezeichen, Einstellungen, Städte, Orte, Reader, About, Disclaimer und Quellen funktionieren ohne Session.
- Orts-, Quellen- und Readerdaten sowie Bilder sind im App-Bundle enthalten. Bookmarks, Sprache, Theme, Reader-Einstellungen und Lesepositionen werden über einen race-sicheren AsyncStorage-Store lokal gespeichert.
- Supabase-Lesezugriffe besitzen einen 10-Sekunden-Timeout mit `AbortController`/`abortSignal`. Lade-, Offline-, Timeout- und Serverzustände werden getrennt behandelt.
- Geschützte Screens verwenden gezielte Route Guards und leiten ohne Session zum Login mit geprüftem internem Rücksprungziel weiter.

### Authentifizierung und Konten

- Der AuthContext trennt initiales Session-/Profil-Laden von Hintergrundrefreshes. App-Resume und Realtime-Rollenänderungen erhalten bestehendes Profil, Navigation und Screen-State; Logout oder ein echter Benutzerwechsel entfernt alte Profildaten sofort.
- Registrierung, Login und Kontoverwaltung unterstützen Anzeigename, `member_type`, `party_size`, Kofferanzahl, E-Mail und Passwort. Die Kofferanzahl gilt für alle durch das Konto vertretenen Personen, kann bei der Registrierung `0` bis `50` betragen und später über die Kontoseite in den Einstellungen geändert werden. Profile können die Rollen `user`, `medical_staff`, `organization_team` und `admin` besitzen.
- Admins können eigenständige Benutzerkonten im Punkt **Familien** zu benannten Familien zusammenfassen. Ein Konto gehört höchstens einer Familie; eine neue Zuordnung verschiebt es atomar aus der bisherigen Familie. Diese Kontofamilien bleiben von `party_size` und Reisegruppen getrennt und können im Busmanagement als Einheit ausgewählt werden.
- „Passwort vergessen“ und der vollständige Recovery-Deep-Link laufen ausschließlich über `/reset-password` beziehungsweise `ziyara:///reset-password`. Normale Login-/Signup-Links werden nicht als Recovery-Link behandelt; nach erfolgreicher Passwortänderung wird die lokale Session entfernt.
- Nutzer können ausschließlich das eigene Konto über `supabase/functions/delete-account` löschen. Die Function nimmt keine Ziel-User-ID an, prüft den Bearer-Token selbst, schützt den letzten Admin und hält Service-Role-Zugangsdaten vollständig aus dem Client.

### Gruppencheck und anonyme Fragerunde

- Gruppencheck-Antworten und Refreshes verwenden eine gemeinsame monotone State-Version, ignorieren veraltete Requests, zeigen erfolgreiche Mutationen optimistisch und laden danach den autoritativen Stand.
- Während das Rollenprofil lädt, entfernt die Pflichtabfrage keine Admin-Routen aus dem Navigationsstack. Nach einer gespeicherten Admin-Antwort führt ein eigener Button zuverlässig zurück in die App.
- Die Adminauswertung zeigt alle relevanten Profile als Ja, Nein oder Noch offen. Account-Anzahl und über `party_size` repräsentierte Personenzahl werden getrennt ausgewiesen.
- Rollenänderungen, Gruppencheck-Antwort gegen Schließen, das Fünf-Fragen-Limit und Account-Löschungen sind auch bei parallelen Transaktionen datenbankseitig abgesichert.
- Anonyme Fragen speichern keine User-/Profil-ID am Fragetext. Temporäre, für Clients nicht lesbare Limit-Zähler werden beim Schließen der Runde gelöscht.

### Busmanagement

- Admins legen eine aktive Reise und benannte Busse an. Für jeden neuen Bus ist eine registrierte Person als Busführer erforderlich.
- Personen werden über ihr registriertes Konto oder gemeinsam als ganze Kontofamilie einem Bus zugeordnet. Sobald eine Familie zugeordnet ist, werden ihre Mitglieder nicht zusätzlich als Einzelpersonen angeboten.
- Eine aktive Reise lässt sich einklappen und schließen. Danach kann eine leere Reise erstellt oder die komplette Busanordnung einschließlich Führung und Personen-/Familienzuordnung aus einer geschlossenen Reise übernommen werden; alte Boardingstände werden nicht kopiert.
- Der eigene Admin-Punkt **Generalalarm** übernimmt das Starten, Überwachen und Beenden des Bestätigungsablaufs. Das Busmanagement bleibt auf Reise-, Bus- und Teilnehmerzuordnung konzentriert.
- Realtime, App-Fokus und ein gestaffelter Fallback-Refresh halten die Übersicht aktuell. Monotone Request-Versionen verhindern, dass ältere Reads einen gespeicherten Status zurücksetzen. Antwort und Schließen sperren dieselbe Boarding-Zeile und bleiben dadurch transaktional geordnet.
- Bei einer abgelaufenen oder fehlenden Auth-Session erneuert der Client die Sitzung und wiederholt eine Teilnehmer- oder Admin-Statusmutation genau einmal für dieselbe User-ID. Endgültige Fehler laden den autoritativen Stand und unterscheiden Auth-, geschlossenes Boarding-, geänderte Zuordnungs-, Offline- und Serverzustände.

### Reisegruppen und Anführerstandort

- Admins bilden im eigenen Punkt **Reisegruppen** Untergruppen aus den der Reise zugeordneten Personen. Jede Person gehört höchstens einer Gruppe; eine registrierte Person wird als Anführer festgelegt und ist automatisch Mitglied.
- Auch ein Admin kann Mitglied oder Anführer sein. Auf Home und unter `/group` sieht er nur seine eigenen Gruppenzuordnungen; die vollständige Gruppenverwaltung bleibt im Adminbereich.
- Der Admin kann den Anführer in der App nach seinem Standort fragen. Der Anführer sieht die Anfrage auf Home und entscheidet ausdrücklich zwischen einer einmaligen Freigabe und Ablehnung; erst nach Zustimmung wird die Vordergrund-Standortberechtigung angefragt.
- Es gibt kein Live- oder Hintergrundtracking. Geteilte Koordinaten sind per RLS nur für Anführer und Admins und höchstens 15 Minuten lesbar; erneute Anfragen sowie Gruppenänderung oder -löschung entfernen die zuvor gespeicherte Position.
- Gruppen, Mitgliedschaften und Standortanfragen werden per Realtime, App-Fokus und gestaffeltem Fallback aktualisiert. Alle Mutationen laufen über serverseitig authentifizierte RPCs.

### Generalalarm

- Der Admin öffnet den eigenen Punkt **Generalalarm**, legt Alarmmeldung und Abfahrt fest und schaltet den Alarm ausdrücklich ein. Der Punkt zeigt jederzeit **Eingeschaltet** oder **Ausgeschaltet** und bietet bei aktivem Alarm eine Beenden-Aktion.
- Ein offenes Boarding führt jede zugeordnete Person durch `Gelesen` → `Ich bin unterwegs` → `Im Bus`; `Problem` bleibt als Ausnahmeweg verfügbar.
- Nach fünf Minuten ohne nächste Stufe werden native lokale Erinnerungen geplant. Ein geschützter Dispatcher beansprucht zusätzlich höchstens einen Expo-Push-Versuch je Gerät, Teilnehmer, Stufe und Fünf-Minuten-Fenster.
- Das separate Generalalarm-Panel zeigt bestätigte und fehlende Personen, alle ausstehenden Namen, die Schließbereitschaft jedes Busses und eine ausdrücklich protokollierte manuelle Eskalation.
- Push-Tokens und Versandversuche sind nicht clientlesbar. Ein Expo-Ticket gilt nur als Annahme durch den Push-Dienst, nie als garantierte Zustellung oder garantiertes Aufwecken.

### Tagesprogramm

- Admins wählen im eigenen Punkt **Tagesprogramm** einen Starttag und planen wahlweise einen, zwei, drei, fünf oder sieben aufeinanderfolgende Tage in einem Formular.
- Jeder Tag erhält eine optionale Überschrift und einen freien organisatorischen Ablauf. Alle ausgewählten Tage werden atomar gespeichert; ein bereits veröffentlichter Tag kann später geändert werden.
- Angemeldete Nutzer sehen das heutige Programm kompakt im grünen Home-Bereich. Ein Tipp öffnet das geschützte Wochenprogramm mit heute und den nächsten sechs Tagen, getrennten Tageskarten und gegliederten Ablaufpunkten. Der letzte erfolgreiche, benutzergebundene Stand wird lokal gespeichert und beim nächsten Start sofort angezeigt, während Realtime, App-Fokus und ein gestaffelter Fallback-Refresh ihn im Hintergrund aktualisieren.
- RLS gibt das Programm der aktiven Reise allen angemeldeten Konten frei, auch wenn das Konto noch keinem Bus zugeordnet ist. Veröffentlichen ist ausschließlich über die serverseitig geprüfte Admin-RPC möglich.

### Reiseführung und „Wo sind wir?“

- Admins veröffentlichen in **Reiseführung** den aktuellen Besuchsort, nächsten Programmpunkt, Abfahrt, Treffpunkt, relevante Tür, Entfernungshinweis, Beschreibung und Handlungen. Im davon getrennten Punkt **Reiseziele & Navigation** legen sie unabhängig davon mehrere benannte Ziele an, setzen deren Standort per Karte, verschiebbarem Marker oder aktuellem Gerätestandort und bearbeiten oder entfernen sie später.
- Teilnehmer melden für ihr zugeordnetes Konto „Noch unterwegs“, „Bin gleich da“, „Beim Treffpunkt“, „Problem“, „Verloren“ oder „Medizinische Hilfe benötigt“. Problemfälle werden ausdrücklich von einem Admin übernommen; der meldende Teilnehmer sieht dessen Anzeigenamen.
- Alle aktiven Reiseziele erscheinen angemeldeten Teilnehmern als rote Marker auf der nativen und der Webkarte und sind einzeln über externe Navigation erreichbar. Verknüpfte Katalogorte bleiben separat sichtbar. Ein validierter, benutzergebundener AsyncStorage-Cache hält den letzten erfolgreichen Reisezielstand über App-Neustarts hinweg sichtbar, falls der erste Serverabruf fehlschlägt; ein erfolgreicher Supabase-Abruf bleibt maßgeblich und entfernt überholte Ziele. Die Entfernung zum aktuellen Programmtreffpunkt wird nur nach einem Klick einmalig bestimmt; es gibt kein permanentes Tracking und keine Speicherung der Geräteposition im Backend.
- Eindeutige Offlinefehler werden in einer validierten, benutzerspezifischen AsyncStorage-Warteschlange vorgemerkt. Die UI sagt ausdrücklich, dass diese Meldung noch nicht beim Reiseleiter angekommen ist.

### Fehlerbehandlung und Monitoring

- Eine globale `AppErrorBoundary` zeigt bei unbehandelten React-Renderfehlern einen verständlichen lokalen Fallback mit Retry.
- Sentry und sonstiges externes Crash-Reporting wurden vollständig entfernt. Es gibt keine Sentry-Abhängigkeit, keine DSN-Konfiguration und keine Übertragung von Namen, E-Mails, Fragetexten, Tokens oder anderen personenbezogenen Daten an einen Monitoringdienst.

## Stack

- Node `22.13.0` aus `.nvmrc`
- Expo SDK `57` (`expo ~57.0.18`)
- React Native `0.86.3`, React `19.2.3`, TypeScript `~6.0.3` im Strict Mode
- Expo Router mit typed routes und nativen Tabs
- Supabase JS `^2.112.3` für Auth, Postgres, RPC und Realtime
- AsyncStorage, React Native Maps auf iOS, Leaflet/OpenStreetMap in `react-native-webview` auf Android sowie Expo Location, Notifications, Device, Image, Clipboard und Linking
- Jest/Jest Expo, pgTAP und Playwright

Expo-/React-Native-Abhängigkeiten nur mit `npx expo install` auf SDK-57-kompatible Versionen bringen. React Native nicht isoliert aktualisieren und kein `npm audit fix --force` verwenden.

## Lokale Entwicklung

```bash
nvm use
npm install
cp .env.example .env
npx expo start
```

Die `.env` bleibt ignoriert. Für den Client werden nur die Supabase-Werte benötigt:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

iOS verwendet weiterhin Apple Maps über `react-native-maps`; unnötige Gebäude-, Indoor-, POI- und Verkehrsebenen sind deaktiviert, die Kartenmitte bleibt im Irak und die kleinen Stadtvorschauen sind statisch. Android verwendet Leaflet direkt in `react-native-webview` mit OpenStreetMap-Kacheln und benötigt weder Expo DOM noch einen Google-Maps-Schlüssel oder hinterlegte Zahlungsdaten. Leaflet-JavaScript und -CSS liegen lokal im App-Bundle; aus dem Internet werden nur sichtbare OSM-Kacheln geladen. Die Android-Karte ist auf den Irak begrenzt, lädt keine Kacheln vorab und nutzt den normalen persistenten HTTP-Cache der WebView sowie einen kleinen Leaflet-Arbeitsspeicherpuffer. Die öffentlichen OpenStreetMap-Kacheln bleiben netzwerkabhängig und unterliegen der [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/); für einen größeren Produktivbetrieb sollte bei Bedarf ein eigener oder ausdrücklich dafür freigegebener Tile-Provider eingesetzt werden. Web verwendet weiterhin die schematische Offlinekarte.

Auf Android werden `react-native-maps` und die ungenutzte `@expo/dom-webview`-Native-View vom Autolinking ausgeschlossen; auf iOS bleiben `react-native-webview` und `@expo/dom-webview` ausgeschlossen. Dadurch bleibt je Plattform nur der tatsächlich verwendete Kartenpfad im nativen Build. Diese Plattformtrennung erfordert einen neuen nativen Android-Development-/Produktionsbuild.

Keine Service-Role-Keys, unbeschränkten API-Schlüssel, personenbezogenen Daten oder Monitoring-DSNs in Appcode, Dokumentation oder Git aufnehmen.

## Prüfungen

```bash
npm run validate
npx expo-doctor@latest
npx expo export --platform web
npx expo export --platform ios
npx expo export --platform android
npm audit
```

`npm run validate` umfasst TypeScript, Lint, Jest mit Coverage-Gates und den Expo-Abhängigkeitscheck. Die Gates verlangen mindestens 50 % globale Line Coverage sowie jeweils 80 % für Auth-, Busmanagement-, Reiseführungs-, Gruppencheck- und Fragerunden-Kontext.

Letzter vollständig ausgeführter Stand vom 30. August 2026:

- `npm run validate`: bestanden; 140 Jest-Tests in 27 Suites
- Line Coverage: global 85,27 %, AuthContext 91,21 %, BusManagementContext 92,90 %, DailyProgramContext 89,87 %, TripGuidanceContext 87,86 %, GroupCheckContext 95,31 %, QuestionRoundContext 95,65 %
- Expo Doctor: 21/21 Checks bestanden
- Web-JavaScript-Export: bestanden; iOS-/Android-Export für diesen Änderungssatz nicht erneut ausgeführt
- Supabase DB-Lint: keine Schemafehler
- pgTAP: 224 Assertions in elf SQL-Testdateien bestanden, einschließlich Familienzuordnung, Kofferzahl, Reisegruppen-, Adminmitgliedschafts- und Standort-RLS
- Playwright: neun lokale Vollstack-Smokes bestanden, einschließlich Recovery, Offline-Start, Busmanagement, Mehrtagesprogramm auf Home und Reiseführung
- `npm audit`: 0 Critical, 4 High, 11 Moderate

Die High-/Moderate-Auditmeldungen liegen in transitiven Expo-/Metro-Buildabhängigkeiten, insbesondere `image-size`, `metro`, Expo Config und `xcode`/`uuid`. Die von npm angebotenen vollständigen Fixes würden auf inkompatible Expo-Versionen wechseln. Auf SDK-kompatible Upstream-Patches warten.

## Lokale Supabase-Abnahme

Docker muss laufen. Diese Befehle dürfen nur gegen die lokale Instanz verwendet werden:

```bash
npx supabase start
npx supabase db reset --local
npx supabase db lint --local --level warning
npx supabase test db --local
npm run test:e2e
```

`db reset --local` löscht ausschließlich die lokale Supabase-Datenbank und baut das Schema vollständig aus unveränderten, vorwärtsgerichteten Migrationen neu auf. Die E2E-Smokes verwenden synthetische `example.invalid`-Konten und dürfen nicht gegen das Remote-Projekt ausgeführt werden.

## Remote-Backend-Stand

Nach ausdrücklicher Freigabe wurden am 27. August 2026 die Migrationen `20260826000000` bis `20260826021000` sowie `20260827000000_add_bus_management.sql` auf das verknüpfte Supabase-Projekt ausgerollt. Am 28. August 2026 folgten `20260827120000_add_trip_guidance.sql`, `20260827130000_add_bus_boarding_read_status.sql`, `20260827140000_add_general_alarm.sql` und `20260827150000_enforce_general_alarm_status_order.sql`. Die Mehrzielmigration `20260828120000_add_trip_navigation_destinations.sql` ist ebenfalls remote angewandt; am 30. August 2026 wurden die zuvor fehlende Migration `20260828130000_add_daily_program.sql` und anschließend `20260830000000_add_trip_groups_and_location_requests.sql` ausgerollt. Bis dahin zeigte die Migrationsliste lokal und remote denselben Stand. Die neue additive Migration `20260830010000_add_account_families_and_luggage.sql` ist nur lokal angewandt und noch nicht remote ausgerollt. Keine bestehende Migration wurde verändert, gelöscht oder zusammengefasst.

Die Edge Function `delete-account` ist remote als aktive Version 1 mit `verify_jwt = false` bereitgestellt. Das schaltet nur die vorgeschaltete Legacy-JWT-Prüfung aus; die Function verlangt weiterhin einen Bearer-Token und validiert ihn über Supabase Auth. Ein anonymer Remote-Aufruf wurde erwartungsgemäß mit HTTP 401 abgewiesen. Es wurde kein reales Konto testweise gelöscht.

Die Remote-Auth-Redirect-Allowlist wurde nicht verändert. Der zuletzt ergänzte Busstatus-Session-Retry, die Reiseführungsoberfläche und der Generalalarm befinden sich im lokalen Clientcode und benötigen für bereits installierte Apps einen neuen Build beziehungsweise ein App-Update. Die zugehörigen Datenbankmigrationen sind remote ausgerollt. `dispatch-general-alarm`, Push-Secrets und Scheduler wurden noch nicht remote eingerichtet. Es wurde kein Client-Build deployed, committed oder gepusht.

## CI

`.github/workflows/ci.yml` verwendet `.nvmrc`, installiert reproduzierbar mit `npm ci` und führt App-Validierung, Expo Doctor, Web-/iOS-/Android-Exports sowie einen Critical-Audit-Gate aus. Ein getrennter Datenbankjob startet Supabase lokal, prüft den 401-Auth-Gate der Löschfunktion, führt DB-Lint und SQL-Tests sowie danach die Playwright-Smokes aus.

## Release-Status

Die Kernarchitektur und die automatisierten lokalen Prüfungen sind stabil, die App ist aber noch nicht vollständig store-releasefähig. Verbleibende Release-Blocker:

- `ziyara:///reset-password` in der Remote-Supabase-Redirect-Allowlist freigeben und Recovery auf signierten iOS-/Android-Builds testen
- Account-Löschung auf einem signierten Build mit einem freigegebenen Testkonto end-to-end prüfen
- finale Bundle-Identifier, Store-/EAS-Konfiguration, App-Icon, Splash- und Markenassets bereitstellen
- veröffentlichungsfertige Datenschutz-, Support- und Store-Metadaten erstellen
- religiöse, historische und ortsbezogene Inhalte fachlich und rechtlich freigeben
- native Karte, RTL, dynamische Schrift und alle drei Sprachen auf Zielgeräten prüfen
- realen Last-/Mobilfunktest für Bus-, Realtime- und Gruppenfunktionen mit der erwarteten Reisegruppengröße durchführen
- Reiseführung mit neuem Client-Build sowie Realtime/Offline-Warteschlange unter realen Mobilfunkbedingungen prüfen
- aktualisierten Client verteilen und Tagesprogramm-Realtime/Zeitzone auf kleinen Zielgeräten prüfen
- Migration `20260830010000_add_account_families_and_luggage.sql` nach ausdrücklicher Freigabe remote ausrollen, den aktualisierten Client verteilen und Registrierung, Kofferänderung sowie Familienverwaltung mit mehreren Testkonten prüfen
- Wegen der angepassten iOS-Berechtigungsbeschreibung einen neuen nativen Build erstellen und Reisegruppen einschließlich Adminmitgliedschaft, Anfrage, Ablehnung, einmaliger Standortfreigabe sowie 15-Minuten-Ablauf auf echten iOS-/Android-Geräten prüfen
- Generalalarm-Dispatcher nach ausdrücklicher Freigabe remote ausrollen, EAS-Projekt-ID/Push-Credentials und minutenweisen Scheduler einrichten, neuen nativen Build verteilen und den Ablauf auf echten Geräten prüfen
- SDK-kompatible Fixes für die verbleibenden High-/Moderate-Auditmeldungen übernehmen, sobald Expo/Metro sie bereitstellt

## Inhaltsregel

Keine Duas, Ziyarat, arabischen Texte, Transliterationen, Übersetzungen, Hadithe, historischen oder religiösen Aussagen ohne Quellenangaben und qualifizierte Inhaltsprüfung hinzufügen. Bis Inhalte fachlich und rechtlich freigegeben sind, den vorhandenen Prüfstatus und den Platzhalter `Volltext wird nach Rechte- und Inhaltsprüfung ergänzt. Quelle siehe unten.` beibehalten.
