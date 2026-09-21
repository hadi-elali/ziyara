# Shia Ziyarah Iraq

Produktionsorientierte Expo-SDK-57-App für eine schiitische Ziyarah-Reise im Irak. Stand dieser Dokumentation: 21. September 2026.

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

### Reiseorganisation: Reise & Busse

- Im gemeinsamen Admin-Punkt **Reiseorganisation** führt der erste Schritt **Reise & Busse** durch das Anlegen einer aktiven Reise und benannter Busse. Für jeden neuen Bus ist eine registrierte Person als Busführer erforderlich.
- Personen werden über ihr registriertes Konto oder gemeinsam als ganze Kontofamilie einem Bus zugeordnet. Sobald eine Familie zugeordnet ist, werden ihre Mitglieder nicht zusätzlich als Einzelpersonen angeboten.
- Eine aktive Reise lässt sich einklappen und schließen. Danach kann eine leere Reise erstellt oder die komplette Busanordnung einschließlich Führung und Personen-/Familienzuordnung aus einer geschlossenen Reise übernommen werden; alte Boardingstände werden nicht kopiert.
- Die **Live-Begleitung** übernimmt das Starten, Überwachen und Beenden des Bestätigungsablaufs. **Reise & Busse** bleibt auf Reise-, Bus- und Teilnehmerzuordnung konzentriert.
- Realtime, App-Fokus und ein gestaffelter Fallback-Refresh halten die Übersicht aktuell. Monotone Request-Versionen verhindern, dass ältere Reads einen gespeicherten Status zurücksetzen. Antwort und Schließen sperren dieselbe Boarding-Zeile und bleiben dadurch transaktional geordnet.
- Bei einer abgelaufenen oder fehlenden Auth-Session erneuert der Client die Sitzung und wiederholt eine Teilnehmer- oder Admin-Statusmutation genau einmal für dieselbe User-ID. Endgültige Fehler laden den autoritativen Stand und unterscheiden Auth-, geschlossenes Boarding-, geänderte Zuordnungs-, Offline- und Serverzustände.

### Reiseorganisation: Gruppen und Anführerstandort

- Im zweiten Schritt **Gruppen** bilden Admins Untergruppen aus den der Reise zugeordneten Personen. Jede Person gehört höchstens einer Gruppe; eine registrierte Person wird als Anführer festgelegt und ist automatisch Mitglied.
- Auch ein Admin kann Mitglied oder Anführer sein. Auf Home und unter `/group` sieht er nur seine eigenen Gruppenzuordnungen; die vollständige Gruppenverwaltung bleibt im Adminbereich.
- Der Admin kann den Anführer in der App nach seinem Standort fragen. Der Anführer sieht die Anfrage auf Home und entscheidet ausdrücklich zwischen einer einmaligen Freigabe und Ablehnung; erst nach Zustimmung wird die Vordergrund-Standortberechtigung angefragt.
- Es gibt kein Live- oder Hintergrundtracking. Geteilte Koordinaten sind per RLS nur für Anführer und Admins und höchstens 15 Minuten lesbar; erneute Anfragen sowie Gruppenänderung oder -löschung entfernen die zuvor gespeicherte Position.
- Gruppen, Mitgliedschaften und Standortanfragen werden per Realtime, App-Fokus und gestaffeltem Fallback aktualisiert. Alle Mutationen laufen über serverseitig authentifizierte RPCs.

### Reiseorganisation: Live-Begleitung und Generalalarm

- Im dritten Schritt **Live-Begleitung** verwaltet der Admin Reiseführung und Generalalarm gemeinsam. Für den Alarm legt er Meldung und Abfahrt fest und schaltet ihn ausdrücklich ein; der Bereich zeigt **Eingeschaltet** oder **Ausgeschaltet** und bietet bei aktivem Alarm eine Beenden-Aktion.
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

- Admins veröffentlichen unter **Reiseorganisation → Live-Begleitung** den aktuellen Besuchsort, nächsten Programmpunkt, Abfahrt, Treffpunkt, relevante Tür, Entfernungshinweis, Beschreibung und Handlungen. Im davon getrennten Punkt **Reiseziele & Navigation** legen sie unabhängig davon mehrere benannte Ziele an, setzen deren Standort per Karte, verschiebbarem Marker oder aktuellem Gerätestandort und bearbeiten oder entfernen sie später.
- Teilnehmer melden für ihr zugeordnetes Konto „Noch unterwegs“, „Bin gleich da“, „Beim Treffpunkt“, „Problem“, „Verloren“ oder „Medizinische Hilfe benötigt“. Problemfälle werden ausdrücklich von einem Admin übernommen; der meldende Teilnehmer sieht dessen Anzeigenamen.
- Alle aktiven Reiseziele erscheinen angemeldeten Teilnehmern als rote Marker auf der nativen und der Webkarte und sind einzeln über externe Navigation erreichbar. Verknüpfte Katalogorte bleiben separat sichtbar. Ein validierter, benutzergebundener AsyncStorage-Cache hält den letzten erfolgreichen Reisezielstand über App-Neustarts hinweg sichtbar, falls der erste Serverabruf fehlschlägt; ein erfolgreicher Supabase-Abruf bleibt maßgeblich und entfernt überholte Ziele. Die Entfernung zum aktuellen Programmtreffpunkt wird nur nach einem Klick einmalig bestimmt; es gibt kein permanentes Tracking und keine Speicherung der Geräteposition im Backend.
- Eindeutige Offlinefehler werden in einer validierten, benutzerspezifischen AsyncStorage-Warteschlange vorgemerkt. Die UI sagt ausdrücklich, dass diese Meldung noch nicht beim Reiseleiter angekommen ist.

### Fehlerbehandlung und Monitoring

- Eine globale `AppErrorBoundary` zeigt bei unbehandelten React-Renderfehlern einen verständlichen lokalen Fallback mit Retry.
- Sentry und sonstiges externes Crash-Reporting wurden vollständig entfernt. Es gibt keine Sentry-Abhängigkeit, keine DSN-Konfiguration und keine Übertragung von Namen, E-Mails, Fragetexten, Tokens oder anderen personenbezogenen Daten an einen Monitoringdienst.

## Stack

- Node `22.13.0` aus `.nvmrc`
- Expo SDK `57` (`expo ~57.0.24`)
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
npx expo start
```

Die `.env` bleibt ignoriert. Für den Client werden nur die Supabase-Werte benötigt:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

iOS verwendet weiterhin Apple Maps über `react-native-maps`; unnötige Gebäude-, Indoor-, POI- und Verkehrsebenen sind deaktiviert, die Kartenmitte bleibt im Irak und die kleinen Stadtvorschauen sind statisch. Android verwendet Leaflet direkt in `react-native-webview` mit OpenStreetMap-Kacheln und benötigt weder Expo DOM noch einen Google-Maps-Schlüssel oder hinterlegte Zahlungsdaten. Leaflet-JavaScript und -CSS liegen lokal im App-Bundle; aus dem Internet werden nur sichtbare OSM-Kacheln geladen. Die Android-Karte ist auf den Irak begrenzt, lädt keine Kacheln vorab und nutzt den normalen persistenten HTTP-Cache der WebView sowie einen kleinen Leaflet-Arbeitsspeicherpuffer. Web verwendet weiterhin die schematische Offlinekarte.

Für die erwartete geschlossene Reisegruppe von knapp 100 Teilnehmern sind die öffentlichen OSM-Kacheln für normale, interaktiv geöffnete Kartenansichten freigegeben. Die Implementierung erfüllt die wesentlichen Vorgaben der [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/): HTTPS-Standard-URL, sichtbare Attribution, App-Kennung `Ziyara/1.0`, HTTP-Cache und weder Vorabladen noch Offline-Massendownload. Diese Freigabe gilt nur, solange die Karte eine ergänzende Komfortfunktion bleibt. Der OSM-Dienst bietet kein SLA und kann Zugriffe ohne Vorankündigung begrenzen. Vor der Reise muss deshalb der sichtbare Fehlerzustand auf einem aktuellen Android-Build geprüft werden; bei Blockierungen, regelmäßig hoher gleichzeitiger Nutzung oder einer betrieblichen Verfügbarkeitsanforderung ist auf einen kommerziellen OSM-basierten Tile-Provider mit SLA und austauschbarer URL zu wechseln. Ein eigener Tile-Server ist für etwa 100 Teilnehmer derzeit nicht gerechtfertigt. Gegen `tile.openstreetmap.org` darf kein synthetischer Lasttest mit simulierten Geräten laufen.

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

Gezielte Produktionsprüfung vom 21. September 2026 auf Commit `aabf955`:

- TypeScript: bestanden
- Lint: keine Fehler; drei unbenutzte Imports in `src/app/(tabs)/bookmarks.tsx`
- Jest: 176/176 Tests in 36 Suites bestanden; Coverage wurde in diesem Durchlauf nicht erneut erhoben
- Web-, iOS- und Android-Export: bestanden
- Expo Doctor: 20/21 Checks bestanden; sechs SDK-57-Pakete liegen jeweils eine erwartete Patchversion zurück
- Expo-Abhängigkeitscheck: fehlgeschlagen wegen derselben sechs Patchabweichungen
- `npm audit --omit=dev`: 0 Critical, 7 High, 15 Moderate
- lokale Docker-/pgTAP-/Playwright-Suiten: in diesem gezielten Durchlauf nicht erneut ausgeführt

Der letzte vollständige pgTAP- und Playwright-Stand bleibt der 14. September 2026. Im aktuellen Worktree sind die Expo-Patchversionen SDK-konform ausgerichtet; Expo Doctor besteht 21/21 Checks. Vor dem nächsten nativen Release muss CI auf dem finalen Commit vollständig grün ausgeführt werden. Keinen `npm audit fix --force` verwenden, weil vorgeschlagene erzwungene Reparaturen inkompatible Expo-Versionen installieren können.

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

Am 21. September 2026 wurden lokale und verknüpfte Remote-Migrationsliste erneut gelesen. Alle 34 Migrationen stimmen bis einschließlich `20260914010000` überein. Keine bestehende Migration wurde verändert, gelöscht oder zusammengefasst.

Die Edge Functions `delete-account`, `dispatch-general-alarm`, `dispatch-emergency-alert` und `dispatch-emergency-duty` sind remote aktiv. `verify_jwt = false` schaltet nur die vorgeschaltete Legacy-JWT-Prüfung aus; die Functions prüfen ihre jeweilige Berechtigung weiterhin selbst.

Für Push ist das EAS-Projekt `@hadi_ea/al-batoul` mit dem nativen Identifier `de.albatoul.ziyara` verbunden. APNs und FCM V1 sind hinterlegt. Das Generalalarm-Scheduler-Secret liegt als Function-Secret und geschützt im Supabase Vault; `dispatch-general-alarm-every-minute` läuft jede Minute und antwortete bei der Einrichtung mehrfach mit HTTP 200. Die vier Edge Functions sind am 21. September 2026 remote als `ACTIVE` bestätigt. iOS- und Android-Preview-Build vom 14. September 2026 sind erfolgreich abgeschlossen, enthalten aber nur Commit `2df176f`; der geprüfte Stand `aabf955` liegt acht Commits weiter und benötigt neue native Builds. Ein realer Push ist weiterhin nicht nachgewiesen. Die Remote-Auth-Redirect-Allowlist wurde im Rahmen dieser Prüfung nicht verändert.

## CI

`.github/workflows/ci.yml` verwendet `.nvmrc`, installiert reproduzierbar mit `npm ci` und führt App-Validierung, Expo Doctor, Web-/iOS-/Android-Exports sowie einen Critical-Audit-Gate aus. Ein getrennter Datenbankjob startet Supabase lokal, prüft den 401-Auth-Gate der Löschfunktion, führt DB-Lint und SQL-Tests sowie danach die Playwright-Smokes aus.

Die CI startet automatisch für jeden Pull Request und nach jedem Push auf `main`. Der finale Commit ist genau der Git-Stand, aus dem anschließend der native Release gebaut wird. Vor dem Merge müssen im Pull Request die Jobs `validate` und `database` grün sein; nach dem Merge wird derselbe Schutz auf `main` erneut ausgeführt. Ein bloßer Push auf einen Feature-Branch ohne Pull Request startet diesen Workflow nicht.

## Release-Status

Die Kernarchitektur und die automatisierten lokalen Prüfungen sind stabil, die App ist aber noch nicht vollständig store-releasefähig. Verbleibende Release-Blocker:

- `ziyara:///reset-password` in der Remote-Supabase-Redirect-Allowlist freigeben und Recovery auf signierten iOS-/Android-Builds testen
- Account-Löschung auf einem signierten Build mit einem freigegebenen Testkonto end-to-end prüfen
- konfigurierte Bundle-Identifier und Markenassets in aktuellen signierten iOS-/Android-Builds visuell prüfen
- veröffentlichungsfertige Datenschutz-, Support- und Store-Metadaten erstellen
- religiöse, historische und ortsbezogene Inhalte fachlich und rechtlich freigeben
- native Karte, RTL, dynamische Schrift und alle drei Sprachen auf Zielgeräten prüfen
- realen Last-/Mobilfunktest für Bus-, Realtime- und Gruppenfunktionen mit der erwarteten Reisegruppengröße durchführen
- Reiseführung mit neuem Client-Build sowie Realtime/Offline-Warteschlange unter realen Mobilfunkbedingungen prüfen
- aktualisierten Client verteilen und Tagesprogramm-Realtime/Zeitzone auf kleinen Zielgeräten prüfen
- Registrierung, Kofferänderung und Familienverwaltung mit mehreren Testkonten auf dem aktuellen Client prüfen; die zugehörigen Migrationen sind bereits remote vorhanden
- Wegen der angepassten iOS-Berechtigungsbeschreibung einen neuen nativen Build erstellen und Reisegruppen einschließlich Adminmitgliedschaft, Anfrage, Ablehnung, einmaliger Standortfreigabe sowie 15-Minuten-Ablauf auf echten iOS-/Android-Geräten prüfen
- aktuelle iOS-/Android-Preview-Builds aus Commit `aabf955` oder neuer erstellen und installieren, Push in der App aktivieren und Generalalarm sowie beide Notfallwege auf echten Geräten unter Vordergrund, Hintergrund, Gerätesperre und schwachem Netz prüfen
- die vollständige CI auf dem finalen Commit erfolgreich ausführen
- SDK-kompatible Fixes für die verbleibenden High-/Moderate-Auditmeldungen übernehmen, sobald Expo/Metro sie bereitstellt

## Inhaltsregel

Keine Duas, Ziyarat, arabischen Texte, Transliterationen, Übersetzungen, Hadithe, historischen oder religiösen Aussagen ohne Quellenangaben und qualifizierte Inhaltsprüfung hinzufügen. Bis Inhalte fachlich und rechtlich freigegeben sind, den vorhandenen Prüfstatus und den Platzhalter `Volltext wird nach Rechte- und Inhaltsprüfung ergänzt. Quelle siehe unten.` beibehalten.
