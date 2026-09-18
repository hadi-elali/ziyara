# Ziyarah – verbindlicher Projektkontext für LLMs

Stand: 17. September 2026

## Zweck und Pflege

Diese Datei ist der feste Einstiegspunkt für jede LLM, die dieses Repository analysiert oder verändert. Sie beschreibt den tatsächlichen Produktzustand, die Architektur, Datenflüsse, Sicherheitsregeln und Arbeitskonventionen.

Bei Änderungen an Architektur, Navigation, Datenmodell, Backend, Umgebungsvariablen, Kernfunktionen oder verbindlichen Regeln muss diese Datei im selben Arbeitsschritt aktualisiert werden. Keine Secrets, echten Zugangsdaten oder personenbezogenen Daten hier eintragen.

Reihenfolge der maßgeblichen Quellen:

1. `AGENTS.md` enthält verbindliche Arbeits- und Inhaltsregeln.
2. Laufzeitcode, `package.json`, `app.json` und Supabase-Migrationen bestimmen das tatsächliche Verhalten.
3. Diese Datei erklärt den aktuellen Gesamtzusammenhang.
4. `docs/IMPLEMENTATION_PLAN.md` ist die ursprüngliche Roadmap. Teile davon sind bereits umgesetzt oder überholt und dürfen nicht ungeprüft als Ist-Zustand behandelt werden.

Wenn Dokumentation und Code voneinander abweichen, den Code prüfen, die richtige Implementierung feststellen und diese Datei korrigieren.

## Produkt in einem Absatz

Ziyarah ist eine produktionsorientierte Expo-App für eine schiitische Ziyarah-Reise in den Irak. Reisende können wichtige Städte und Orte ohne Anmeldung offline aus einem gebündelten Katalog öffnen, Orte auf einer Karte sehen, Inhalte durchsuchen, Einträge merken und religiöse Texte in einem Reader anzeigen. Eine Supabase-Anmeldung wird erst für Konto-, Notfall-, Tagesprogramm-, Bus-, Reisegruppen-, Generalalarm-, Reiseführungs-, Gruppencheck-, Fragerunden- und Adminfunktionen benötigt. Die App bietet Deutsch, Englisch und Arabisch, Light/Dark Mode sowie administrative Gruppenfunktionen: dauerhafte Notfallmeldungen an das medizinische Team oder Reiseteam mit optionalem einmaligem Standort und Push, datumsbasierte Tagesprogramme auf Home, live veröffentlichte Programmpunkte und Treffpunkte, Buszuordnung und Boarding mit Erinnerungs-/Eskalationsablauf, Untergruppen mit benanntem Anführer und zustimmungsbasierter einmaliger Standortanfrage, verpflichtende Statusabfragen, eine anonyme Fragerunde und eine Benutzerübersicht. Passwort-Recovery und sichere Eigenkonto-Löschung sind implementiert. Religiöse, historische und ortsbezogene Inhalte bleiben bis zu einer qualifizierten Prüfung sichtbar als `needs_review` markiert.

## Aktueller Funktionsumfang

### Konten und Reisegruppe

- Der lokale Guide einschließlich Home, Karte, Suche, Lesezeichen, Einstellungen, Städten, Orten, Reader, About, Disclaimer und Quellen ist ohne Anmeldung nutzbar.
- Eine Supabase-E-Mail/Passwort-Anmeldung ist für Kontoverwaltung, Buszuordnung und Boarding, Reisegruppen und Standortanfragen, verpflichtende Gruppenabfragen, anonyme Fragerunden und Administration erforderlich.
- Die Registrierung erfasst Anzeigename, Zuordnung als `brother` oder `sister`, Kontoumfang, Kofferanzahl, benötigte SIM-Karten, E-Mail und Passwort.
- Beim Kontoumfang wird ausdrücklich zwischen „nur ich“ und „ich und Familie ohne eigenes Telefon“ gewählt.
- `party_size` zählt den Kontoinhaber mit. Der Wert `1` bedeutet Einzelkonto; bei Familienauswahl beginnt der Wert bei `2`.
- In ein Familienkonto gehören ausschließlich mitreisende Kinder oder Angehörige ohne eigenes Telefon. Erwachsene mit eigenem Telefon, einschließlich Ehepartner, erstellen ein eigenes Konto.
- Bestehende Konten aus der Zeit vor Einführung von `member_type` können dort `null` haben. Die aktuelle Registrierung verlangt die Auswahl.
- Nutzer können später E-Mail, Passwort, `party_size`, Kofferanzahl und benötigte SIM-Karten auf der über Einstellungen erreichbaren Kontoseite ändern. `luggage_count` zählt alle aufgegebenen Koffer der durch dieses Konto vertretenen Personen; `sim_card_count` zählt deren benötigte SIM-Karten. Beide Werte erlauben `0` bis `50` und starten für ältere Konten mit `0`.
- Admins können eigenständige App-Konten zu benannten Kontofamilien zusammenfassen. Ein Profil gehört höchstens einer Kontofamilie; eine neue Zuordnung verschiebt es atomar aus der bisherigen Familie. Diese Zuordnung ist unabhängig von `party_size` und Reisegruppen und kann im Busmanagement als gemeinsame Zuordnungseinheit verwendet werden.
- „Passwort vergessen“ sendet einen neutral formulierten Recovery-Hinweis und verwendet ausschließlich die dedizierte Route `/reset-password`. Der AuthProvider verarbeitet implizite Recovery-Tokens, PKCE-Codes und `token_hash`-Links; normale Login- oder Signup-Links werden nicht als Passwort-Recovery akzeptiert. Nach erfolgreicher Passwortänderung werden die lokalen Anmeldedaten entfernt und eine erneute Anmeldung verlangt.
- Angemeldete Nutzer können nach einem ausdrücklichen, plattformübergreifenden Bestätigungsdialog nur das eigene Konto unwiderruflich löschen. Der Client übergibt keine Ziel-User-ID. Der lokale Function-Quellcode und die ausdrücklich remote bereitgestellte Edge Function verifizieren den Bearer-Token serverseitig, leiten daraus die Auth-ID ab und halten den Service-Role-Key vollständig aus dem App-Bundle heraus.
- Profile besitzen die Rollen `user`, `medical_staff`, `organization_team` und `admin`.
- Neue Konten starten immer als `user`. Nur ein Admin kann über die abgesicherte RPC die Rollen `user`, `medical_staff`, `organization_team` und `admin` vergeben.
- Bestehende Adminprofile können umgestuft werden, solange mindestens ein Admin erhalten bleibt. Rollenwechsel sind datenbankseitig serialisiert und werden protokolliert, damit auch bei mehreren gleichzeitig arbeitenden Admins nie versehentlich alle Adminrechte entfernt werden.
- `medical_staff` und `organization_team` besitzen zusätzlich ein rollenbezogenes Notfall-Postfach. Andere Reise- und Adminrechte bleiben davon unberührt.

### Reise- und Inhaltsfunktionen

- Startseite mit einer kompakten Vorschau des heutigen Tagesprogramms für angemeldete Nutzer sowie wichtigen Städten und hervorgehobenen Orten; die Vorschau öffnet eine gegliederte Sieben-Tage-Ansicht.
- Stadtseiten mit lokal gefilterten Orten.
- iOS-Karte mit Apple Maps über `react-native-maps` und Android-Karte mit Leaflet/OpenStreetMap direkt in `react-native-webview`; beide zeigen Marker, eine optionale Standortfreigabe über einen schwebenden blauen Standortpfeil, eine über „Reiseziele“ aufrufbare hohe Liste veröffentlichter Gruppenziele und die Übergabe an eine externe Navigation. Android benötigt weder Expo DOM noch einen Google-Maps-Schlüssel und begrenzt Kartenbewegung sowie Tile-Anfragen auf den Irak.
- Web-Fallback als schematische Irak-Karte plus Ortsliste und über „Reiseziele“ einblendbarer Gruppenziel-Liste; Web importiert kein `react-native-maps`.
- Ortssuche, Inhaltssuche und Suche nach empfohlenen Handlungen.
- Ortsdetails mit Bildern, Quellen, Hinweisen, empfohlenen Handlungen und Merkliste.
- Reader mit fest zusammengehörenden Absatzblöcken aus Arabisch, Transliteration und deutscher Übersetzung, RTL für Arabisch, getrennten persistenten Sichtbarkeits- und Schriftgrößeneinstellungen, Kopieren, Teilen und Merkliste.
- Sprache Deutsch/Englisch/Arabisch und Theme `system`/`light`/`dark` werden lokal gespeichert. Eine explizite Theme-Auswahl synchronisiert zusätzlich das native App-Farbschema und den Native-Tabs-Container, damit native Zurück- und Navigationsbuttons beim Umschalten nicht zwischen zwei Darstellungen flackern.
- Beim ersten Start zeigt die App ein lokal gebündeltes Einführungsvideo und eine Sprachauswahl. Die Auswahl wird separat gespeichert und öffnet unmittelbar die Registrierung; dort bleiben Anmeldung und die Nutzung des öffentlichen Guides ohne Konto als gleichwertige Wege erreichbar.
- Eine vorhandene Anmeldung gilt zugleich als abgeschlossenes Onboarding und wird lokal entsprechend übernommen. Wenn eine verpflichtende Gruppenabfrage den normalen App-Bereich sperrt, ist `/check-in` die erste Navigator-Ausweichroute; die Sprachauswahl kann dadurch nicht versehentlich als Fallback erscheinen.

### Gruppenfunktionen

- Angemeldete Nutzer erreichen die geschützte Route `/emergency` ausschließlich von der Home-/Indexseite über einen kompakten, runden Alarm-Button rechts auf halber Bildschirmhöhe. Dort wählen Nutzer ausdrücklich das medizinische Team oder Reiseteam, beschreiben Anliegen und Aufenthaltsort und können optional nach Vordergrund-Berechtigung genau eine Geräteposition mitsenden. Es gibt kein Live- oder Hintergrundtracking. Die Datenbank materialisiert alle zum Absendezeitpunkt vorhandenen Profile der Rolle `medical_staff` beziehungsweise `organization_team` als Empfänger; die Meldung bleibt für diese Empfänger im Postfach lesbar und besitzt einen individuellen Lesestatus.
- Die Notfallmeldung wird zuerst dauerhaft gespeichert und anschließend bestmöglich über die Edge Function `dispatch-emergency-alert` an alle registrierten Expo-Push-Geräte der Empfänger geschickt. Die Function akzeptiert ausschließlich den verifizierten Absender der konkreten Meldung, beansprucht jeden Geräteversuch idempotent und legt keine Push-Tokens im Client offen. Ein Pushfehler ändert nicht nachträglich eine erfolgreich gespeicherte Postfachmeldung. Push-Tipps öffnen `/emergency`; medizinisches Personal und Organisationsteam können dort Push aktivieren. Anliegen und genaue Koordinaten stehen nur im geschützten Postfach und werden nicht in den Sperrbildschirmtext übernommen.

- Ein Admin kann eine aktive Reise mit benannten Bussen anlegen. Jeder neu angelegte Bus benötigt eine registrierte Person als Busführer. Anschließend wird entweder eine registrierte Person oder eine ganze Kontofamilie einem Bus zugeordnet; nach der Familienzuordnung werden deren Mitglieder nicht zusätzlich in der Einzelpersonenauswahl angeboten.
- Die aktive Reise ist im Adminbereich zuklappbar und kann ohne offenes Boarding geschlossen werden. Danach lässt sich eine leere Reise anlegen oder die Busanordnung einer geschlossenen Reise vollständig übernehmen: Busse, Busführer und Personen-/Familienzuordnungen werden kopiert, Boardingstände und andere Reisefunktionen nicht.
- Im getrennten Admin-Punkt `Reisegruppen` stellt ein Admin die der Reise zugeordneten Personen zu Untergruppen zusammen und bestimmt genau eine registrierte Person als Gruppenanführer. Eine Person gehört höchstens einer Untergruppe; der Anführer ist immer zugleich Mitglied. Gruppen können atomar geändert oder gelöscht werden.
- Jede App-Rolle einschließlich `admin` kann über ihre kontogebundene Reisezuordnung Mitglied oder Anführer sein. Admins sehen auf Home und unter `/group` nur ihre eigenen Gruppenzuordnungen; die vollständige Übersicht und Verwaltung bleibt im Adminbereich.
- Ein Admin kann den Anführer einer Gruppe in der App nach seinem aktuellen Standort fragen. Nur der betroffene Anführer sieht die Anfrage und entscheidet ausdrücklich zwischen einer einmaligen Freigabe und Ablehnung. Erst nach Zustimmung fordert das Gerät die Vordergrund-Standortberechtigung an und ermittelt genau eine Position; es gibt kein Live- oder Hintergrundtracking. Geteilte Koordinaten sind per RLS nur für den Anführer und Admins und nur 15 Minuten lesbar, werden bei einer neuen Anfrage, Gruppenänderung oder Löschung überschrieben beziehungsweise entfernt und erscheinen beim Anführer als Home-Hinweis mit eigener Route `/group`.
- Für jede Abfahrt kann genau ein Boarding pro Reise geöffnet werden. Zugeordnete Konten melden `on_way`, `boarded` oder `problem`; Admins sehen zusätzlich nicht bestätigte Personen und dürfen jeden Status manuell korrigieren. Die Übersicht zählt kontogebundene Reisezuordnungen und nicht `party_size`.
- Im Adminbereich sind Busmanagement und Generalalarm getrennte Punkte: Das Busmanagement bereitet Reise, Busse und Teilnehmerzuordnungen vor; im eigenen Generalalarm-Punkt legt der Admin Meldung und eine frei wählbare Abfahrtszeit zwischen 1 und 1440 Minuten fest. Die Werte 15, 30 und 60 Minuten bleiben als Schnellauswahl verfügbar. Anschließend schaltet der Admin den Alarm ausdrücklich ein, überwacht ihn und beendet ihn wieder. Der Akkordeonstatus zeigt `Eingeschaltet` oder `Ausgeschaltet`.
- Der Generalalarm ergänzt das Boarding um die sichtbare Folge `read` → `on_way` → `boarded`. Nach fünf Minuten ohne nächste Stufe wird sie erneut fällig. Native Geräte gleichen dafür begrenzt vorausgeplante lokale Erinnerungen ab; der serverseitige Push-Dispatcher beansprucht zusätzlich je Gerät, Person, Stufe und Fünf-Minuten-Fenster höchstens einen Versandversuch.
- Kurz vor der Abfahrt wird der Alarm optisch dringlich. Das Adminpanel zeigt bestätigte und fehlende Teilnehmer, alle ausstehenden Namen sowie je Bus, ob noch Personen fehlen. Ein Admin kann einen ausstehenden Fall ausdrücklich manuell eskalieren; verantwortlicher Anzeigename und Zeitpunkt werden serverseitig erfasst.
- Expo-Push-Tokens sind für Clients nicht lesbar und werden nur über benutzergebundene RPCs registriert oder abgemeldet. Der Dispatcher akzeptiert einen serverseitig verifizierten Admin-Token oder ein Scheduler-Secret; fällige Fenster und Ergebnisse sind ausschließlich für `service_role` zugänglich. Ein erfolgreiches Expo-Ticket wird nicht als garantierte Gerätezustellung bezeichnet.
- Boarding-Reads und -Mutationen verwenden monotone Request-Versionen, optimistische Zustände und einen autoritativen Folge-Refresh. Antwort und Schließen sperren dieselbe Boarding-Zeile, sodass ein paralleler Status entweder vollständig vor dem Schließen gespeichert oder danach abgewiesen wird.
- Im getrennten Admin-Punkt `Tagesprogramm` wählt die Reiseleitung einen Starttag und ein, zwei, drei, fünf oder sieben aufeinanderfolgende Tage, pflegt je Tag eine optionale Überschrift und einen freien organisatorischen Ablauf und speichert alle gewählten Tage atomar. Ein bereits veröffentlichter Tag kann über dasselbe Formular geändert werden. Alle angemeldeten Nutzer sehen auf Home eine auf drei Zeilen begrenzte Vorschau des heutigen Programms. Ein Tipp öffnet `/program` mit heute und den nächsten sechs Tagen in getrennten Tageskarten; Programmzeilen mit vorangestellter Uhrzeit werden als gegliederte Ablaufpunkte dargestellt. Der letzte erfolgreiche Programmstand wird validiert und an die Benutzer-ID gebunden lokal gespeichert, beim nächsten Start sofort angezeigt und im Hintergrund aktualisiert. Auch eine erfolgreiche leere Serverantwort ist autoritativ. Lesen ist für den aktiven Reiseplan freigegeben, Schreiben ausschließlich über die Admin-RPC.
- Ein Admin kann für die aktive Reise im Admin-Punkt `Reiseführung` einen aktuellen Programmpunkt veröffentlichen. Teilnehmer sehen Besuchsort, nächsten Programmpunkt, Abfahrtszeit, Treffpunkt, relevante Tür, einen optionalen Entfernungshinweis, Beschreibung und Handlungen. Im getrennten Dashboard-Punkt `Reiseziele & Navigation` verwaltet der Admin unabhängig davon mehrere benannte Ziele: anlegen, auf einer plattformspezifischen Karte beziehungsweise per aktuellem Gerätestandort setzen, bearbeiten, Navigation prüfen und archivieren. Aktive Ziele erscheinen angemeldeten Reiseteilnehmern per Realtime als rote Marker auf der nativen und schematischen Webkarte. Auf beiden Plattformen blendet der Button „Reiseziele“ zusätzlich eine Liste ein; nativ zentriert die Auswahl die Karte auf dem Ziel, im Web kann die Navigation direkt aus der Liste geöffnet werden. Der letzte erfolgreiche Reisezielstand wird validiert und an die Benutzer-ID gebunden in AsyncStorage zwischengespeichert, damit er nach einem App-Neustart auch bei einem anfänglichen Lesefehler sichtbar bleibt. Erfolgreiche Supabase-Antworten einschließlich einer leeren Zielliste bleiben autoritativ.
- Die Entfernung zum Treffpunkt wird auf Wunsch aus einer einzelnen Standortabfrage berechnet. Es existiert kein permanentes Standorttracking und keine Speicherung der abgefragten Geräteposition im App- oder Backendzustand.
- Kurzfristige Treffpunktänderungen aktualisieren denselben Programmpunkt und behalten Statusmeldungen. Ein ausdrücklich neu veröffentlichter Programmpunkt schließt den vorherigen und beginnt mit leeren Meldungen. Beide Tabellen werden über Realtime und gestaffelte Fallback-Refreshes synchronisiert.
- Teilnehmer melden für ihre kontogebundene Reisezuordnung `on_way`, `almost_there`, `at_meeting_point`, `problem`, `lost` oder `medical_help`. Ein Admin muss einen Problemfall ausdrücklich übernehmen; der Teilnehmer sieht anschließend den dabei erfassten Anzeigenamen der Leitung.
- Bei einem eindeutigen Netzwerkfehler wird eine Statusmeldung benutzerspezifisch in `AsyncStorage` vorgemerkt und später idempotent erneut übertragen. Die UI kennzeichnet den lokalen Status deutlich als noch nicht beim Reiseleiter angekommen. Server-, Berechtigungs- oder geschlossene Programmpunktfehler werden nicht fälschlich als erfolgreiche Offlineübertragung dargestellt.
- Ein Admin kann genau eine verpflichtende Gruppenabfrage mit freiem Fragetext öffnen.
- Während sie aktiv und noch unbeantwortet ist, sehen Konten ohne Adminrolle ausschließlich den Check-in und antworten mit Ja oder Nein. Nach der ersten erfolgreich gespeicherten Antwort wird die App sofort wieder freigegeben; der Home-Hinweis bleibt bis zum Ende der Abfrage sichtbar und erlaubt jederzeit den Wechsel der Antwort. Admins bleiben durchgehend in der App und können ebenfalls antworten.
- Solange das Auth-Profil und damit die Rolle noch geladen werden, greift die blockierende Navigation nicht; dadurch werden Admin-Routen nicht vorübergehend aus dem Stack entfernt. Nach einer gespeicherten Teilnehmerantwort führt der Check-in per `replace` in die App zurück; zusätzlich bleibt dort ein expliziter Rückweg sichtbar.
- Bei einem Synchronisationsfehler bleibt die App für Konten ohne bereits bekannte Antwort vorsorglich gesperrt. Eine erfolgreich gespeicherte Antwort wird durch einen späteren Hintergrundfehler nicht wieder in den Sperrzustand versetzt.
- Ein Admin kann eine anonyme Fragerunde öffnen und schließen, Fragen lesen und als erledigt markieren.
- Jede angemeldete Rolle einschließlich Admin kann während einer offenen Runde bis zu fünf anonyme Fragen absenden. Die Fragentabelle speichert keine Profil- oder User-ID. Eine getrennte, für Clients nicht lesbare Zähltabelle hält während der offenen Runde nur Profil, Runde und Anzahl fest und wird beim Schließen geleert. Nutzer sollten trotzdem keine personenbezogenen Daten in den Freitext schreiben.
- Die Personenübersicht im Adminbereich gruppiert zugeordnete Konten als gemeinsames Familienpaket und lässt sich nach Personen- oder Familiennamen filtern. Die Übersicht summiert registrierte Konten, vertretene Personen, Bruder-/Schwester-Konten, alte Konten ohne Zuordnung, Kontofamilien, Koffer und benötigte SIM-Karten. Die Geschlechterzahlen beziehen sich ausschließlich auf registrierte Konten, weil zusätzliche durch ein Konto vertretene Angehörige nicht einzeln erfasst werden. Jede Person zeigt zunächst ausschließlich ihren Namen; Zuordnung, vertretene Personenzahl, Kofferanzahl, SIM-Karten, Kontofamilie und Rolle werden erst über ein Chevron aufgeklappt. Die Vergabe aller Rollen einschließlich `admin` öffnet sich innerhalb dieser Detailansicht; neue Konten besitzen standardmäßig die Rolle `user`. Im getrennten Punkt `Familien` legt ein Admin Kontofamilien an, bearbeitet oder löscht sie und ordnet registrierte Konten atomar zu.
- Gruppenstatus wird primär über Supabase Realtime und beim App-Fokus aktualisiert. Als gestaffelter Ausfallschutz läuft die Pflichtabfrage etwa alle 60–90 Sekunden und die Fragerunde alle 120–150 Sekunden. Parallele Antworten dürfen ältere Ergebnisse nicht mehr über neuere schreiben.
- Gruppencheck-Refreshes und -Mutationen teilen eine monotone State-Version. Jede Mutation invalidiert ältere Reads, hält nach erfolgreicher RPC-Antwort einen optimistischen Zustand sichtbar und startet anschließend einen autoritativen Refresh. Die Adminauswertung führt alle aktuellen Profile auf und trennt `true`, `false` und `null` ausdrücklich in Ja, Nein und Noch offen; Account-Anzahl und die über `party_size` repräsentierte Personenzahl werden separat ausgewiesen.

## Umgesetzte technische Härtung

Die ursprünglich getrennt beauftragten Produktionsphasen sind im aktuellen Worktree wie folgt umgesetzt:

1. **Build-Basis:** Node `22.13.0`, Expo-SDK-57-kompatible Abhängigkeiten, unverändert Expo-gesteuertes React Native sowie CI-Schritte für Expo Doctor und getrennte Web-/iOS-/Android-Exports.
2. **Auth- und Navigation:** initiales Profil-Laden ist von Hintergrundrefreshes getrennt; App-Resume erhält Profil, Navigation und Screen-State. Logout und echte Benutzerwechsel räumen alte Profildaten sofort, Realtime-Rollenänderungen bleiben aktiv.
3. **Öffentlicher Offline-Guide:** der globale Login-Zwang ist entfernt. Nur geschützte Screens und Aktionen verlangen eine Session. Supabase-Reads besitzen definierte Abbruch-Timeouts und unterscheidbare Offline-/Timeout-/Serverzustände.
4. **Race-sicherer Gruppencheck:** Mutation und Refresh teilen eine State-Version; veraltete Ergebnisse werden verworfen, erfolgreiche Antworten optimistisch gehalten und autoritativ bestätigt. Adminergebnisse umfassen auch nicht antwortende Profile sowie getrennte Account- und Personenzahlen.
5. **Datenbankhärtung:** RLS-, RPC-, Limit-, Last-Admin-, Cascade-, Audit- und Parallelitätstests sind als pgTAP/SQL automatisiert. Die sieben zuvor bestehenden Anwendungstabellen und die ausdrücklich zu erhaltenden Legacyfelder bleiben bestehen; der ungenutzte Antwortindex wurde ausschließlich über eine neue Migration entfernt.
6. **Recovery und Eigenkonto-Löschung:** vollständiger Recovery-Deep-Link, neuer Passwortscreen, serverseitig authentifizierte Löschfunktion ohne frei wählbare Ziel-ID, Last-Admin-Schutz, sichere Cascades und anonymisierte Auditbezüge.
7. **Tests und Fehlerbehandlung:** Coverage-Gates, sieben Playwright-Vollstack-Smokes und eine globale Error Boundary sind aktiv. Sentry beziehungsweise externes Crash-Reporting wurden entfernt; es existieren weder Clientabhängigkeit noch DSN-Konfiguration oder Monitoring-Datenübertragung.
8. **Busmanagement:** Reise-, Bus-, Personen-/Familienzuordnungs- und Boardingmodell, verpflichtende Busführer, zuklappbare und schließbare Reisen sowie optionale Übernahme einer geschlossenen Busanordnung sind implementiert. Ein interner Legacy-Schlüssel bleibt nur zur relationalen Kompatibilität bestehen und wird weder eingegeben noch angezeigt. RLS/RPCs, Realtime, monotone Request-Versionen, Parallelitätstests und E2E-Smoke der bisherigen Boardinglogik bleiben erhalten. Der Session-Retry erneuert bei Auth-/Function-Grant-Fehlern die Session und wiederholt den Status-RPC genau einmal für dieselbe User-ID.
9. **Reiseführung und Treffpunkt:** versionierte aktuelle Programmpunkte, kurzfristige Live-Änderungen, sechs Teilnehmerzustände, ausdrückliche Problemübernahme, lokale Offline-Warteschlange und einmalige Distanzberechnung ohne Tracking sind implementiert. RLS bindet Meldungen an kontogebundene Reisezuordnungen und zeigt normalen Konten ausschließlich eigene Meldungen.
10. **Tagesprogramm:** datumsbasierte Ein- und Mehrtagesplanung, atomare Admin-Upserts, Realtime-/Fokus-/Fallback-Synchronisierung, benutzergebundener Neustart-Cache, lokale Datumsberechnung ohne UTC-Tagesverschiebung sowie Home-Vorschau und Wochenansicht für alle angemeldeten Nutzer sind implementiert.
11. **Reisegruppen und Anführerstandort:** Untergruppen aus kontogebundenen Reisezuordnungen, ein registrierter Anführer, Adminverwaltung, Realtime-Synchronisierung und eine zustimmungsbasierte einmalige Standortantwort mit 15-minütiger RLS-Sichtbarkeit sind lokal implementiert und datenbankseitig getestet.
12. **Kontofamilien, Koffer und SIM-Karten:** Registrierung und Kontoseite verwalten begrenzte Koffer- und SIM-Karten-Zahlen pro Konto; Admins sehen Einzelwerte und Gesamtsummen und gruppieren eigenständige Benutzerkonten atomar in höchstens eine benannte Kontofamilie. RLS, minimale Admin-RPCs und Lösch-/Verschieberegeln sind lokal implementiert.

## Technischer Stack

- Expo SDK `57` (`expo ~57.0.22`)
- React Native `0.86.3`
- React `19.2.3`
- TypeScript `~6.0.3`, Strict Mode
- Expo Router `~57.0.21` mit typed routes
- Native Tabs aus `expo-router/unstable-native-tabs`
- Supabase JS `^2.112.3` für Auth, Postgres, RPC und Realtime
- AsyncStorage `2.2.0` für lokale Einstellungen
- React Native Maps `1.27.2` für iOS, Leaflet `1.9.4` in React Native WebView `13.16.1` für Android sowie Expo Location
- Expo Image, Clipboard und Linking
- Expo Notifications und Expo Device für native Push-Registrierung, Notification-Kanäle und lokale Generalalarm-Erinnerungen
- Jest/Jest Expo für Unit-/Kontexttests, pgTAP für Datenbankregeln und Playwright für lokale Vollstack-Smokes

Für lokale Projektbefehle und CI die in `.nvmrc` festgelegte Node-Version `22.13.0` verwenden; `package.json` bildet zusätzlich die von React Native 0.86 unterstützten Engine-Bereiche ab. Node 23 ist nicht unterstützt. Expo-/React-Native-Pakete mit `npx expo install <paket>` installieren, damit SDK-Versionen ausgerichtet bleiben.

## Projektstart

Der Projektstamm ist das Verzeichnis mit `package.json`.

```bash
nvm use
npm install
cp .env.example .env
npx expo start
```

Erforderliche Client- und Build-Konfiguration:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Die echte `.env` ist ignoriert und darf nicht ausgegeben oder committed werden. Ohne beide Supabase-Werte wirft `src/features/auth/supabase.ts` beim App-Start absichtlich einen Fehler. Für Android ist kein Karten-API-Schlüssel erforderlich.

Nützliche Startbefehle:

```bash
npm run ios
npm run android
npm run web
```

`app.json` konfiguriert Portrait-Modus, das Scheme `ziyara`, automatische Systemdarstellung, Standortberechtigungen, statischen Web-Export, Expo Router und die beiden bereitgestellten Markenassets: `assets/images/icon.png` dient als App-Icon auf iOS, Android und Web; `assets/images/logo.png` wird für den nativen Splash Screen sowie das Android-Monochrom- und Benachrichtigungssymbol verwendet. `package.json` schließt auf Android `react-native-maps` und die ungenutzte `@expo/dom-webview`-Native-View aus; auf iOS bleiben die WebView-Native-Module ausgeschlossen und Apple Maps aktiv. `eas.json` besitzt interne Preview- und Production-Buildprofile. Änderungen an nativen Abhängigkeiten oder App-Konfiguration können einen neuen Development Build erfordern.

## Architektur und Verzeichnisstruktur

```text
src/app/                    Expo-Router-Routen und Screen-Komposition
src/components/ui/          Wiederverwendbare UI-Primitives
src/components/             App-weite zusammengesetzte Komponenten
src/constants/              Theme-Tokens und Layout-Konstanten
src/data/                   Gebündelte Offline-Daten und Katalogsuche
src/domain/                 App- und Datenbanktypen
src/features/auth/          Supabase-Client, Auth-State, Formulare
src/features/account-families/Adminverwaltung eigenständiger Kontofamilien
src/features/bus-management/Buszuordnung, Boarding-State und Adminoberfläche
src/features/daily-program/  Datumsbasierte Tagesplanung, benutzergebundener Cache, Admineditor, Home-Vorschau und Wochenansicht
src/features/general-alarm/ Push-Registrierung, lokale Erinnerungsplanung und Benachrichtigungsrouting
src/features/group-check/   Pflichtabfrage für die Reisegruppe
src/features/trip-groups/   Reisegruppen, Anführerzuordnung und einmalige Standortanfrage
src/features/question-round/Anonyme Fragerunden
src/features/trip-guidance/ Live-Programmpunkt, Teilnehmerstatus und Offline-Warteschlange
src/features/i18n/          UI-Wörterbücher und lokalisierte Fachdaten
src/features/map/           Native Karte und Web-Fallback
src/features/network/       Abbruch und Fehlerklassifizierung für Supabase-Lesezugriffe
src/features/onboarding/    Persistenter Erststart-Status und Navigationsentscheidung
src/features/places/        Ortsbilder, Stadtkarte, externe Navigation
src/features/reader/        Darstellung religiöser Textsegmente
src/features/storage/       AsyncStorage-Hooks
src/features/theme/         Gespeicherter Theme-Modus
supabase/migrations/        Versioniertes Postgres-Schema, RLS und RPCs
supabase/functions/         Lokaler Function-Quellcode; Remote-Deployments nur nach ausdrücklicher Freigabe
assets/images/places/       Lokal gebündelte Ortsbilder
assets/videos/              Lokal gebündeltes Einführungsvideo
docs/IMPLEMENTATION_PLAN.md Ursprüngliche Roadmap, nicht alleinige Ist-Quelle
```

Der Alias `@/*` zeigt laut `tsconfig.json` auf `src/*`; `@/assets/*` zeigt auf `assets/*`.

### Provider-Baum und globaler Zustand

`src/app/_layout.tsx` verschachtelt Fehlergrenze und Provider in dieser Reihenfolge:

```text
AppErrorBoundary
└── AppI18nProvider
    └── AppThemeProvider
        └── AuthProvider
            └── BusManagementProvider
                └── TripGroupProvider
                    └── DailyProgramProvider
                        └── GeneralAlarmNotificationsProvider
                            └── TripGuidanceProvider
                                └── GroupCheckProvider
                                    └── QuestionRoundProvider
                                        └── RootNavigation
```

Die Reihenfolge ist relevant: Bus-, Reisegruppen-, Tagesprogramm-, Generalalarm-, Reiseführungs-, Gruppen- und Fragerundenfunktionen benötigen den Auth-State; der Reisegruppenprovider benötigt zusätzlich aktive Reise und kontogebundene Reisezuordnungen aus dem Buszustand, der Generalalarm ebenfalls den bereits berechneten Buszustand. Der Splash Screen wartet nur auf die lokal gespeicherten Sprach-, Theme- und Onboardingzustände; Auth-, Profil-, Bus-, Reisegruppen-, Tagesprogramm-, Generalalarm-, Reiseführungs-, Gruppen- und Fragerundenabfragen dürfen den öffentlichen Guide nicht blockieren. Ohne Session überspringen die privaten Provider Tabellenabfragen und Realtime-Kanäle vollständig und entfernen lokale Generalalarm-Erinnerungen. Bei einer vorhandenen Session blockiert nur das initiale Profil-/Pflichtabfrage-Laden beziehungsweise ein echter Benutzerwechsel die geschützte Navigation. Der Tagesprogrammprovider zeigt einen passenden benutzergebundenen Cache bereits während des initialen Serverabrufs; auf Web wird dieser Stand synchron aus `localStorage`, nativ über den gemeinsamen AsyncStorage-Hook geladen. Bus-, Reisegruppen-, Tagesprogramm- und Reiseführungs-Hintergrundrefreshes behalten den letzten Stand sichtbar und melden Offline-, Timeout- oder Serverfehler ohne die Navigation auszuhängen. Ein Profilfehler bleibt als wiederholbarer, nicht blockierender Hinweis sichtbar; Rollen- und Gruppenrechte werden dadurch nicht erweitert.

`AppErrorBoundary` verwendet absichtlich keine Theme-, I18n-, Auth- oder Netzwerkabhängigkeit, damit der Fallback auch bei einem Providerfehler rendern kann. Die Fehlergrenze arbeitet vollständig lokal; externes Crash-Reporting ist nicht Bestandteil der App.

`AuthProvider` trennt das initiale Session-/Profil-Laden und echte Benutzerwechsel von Hintergrundaktualisierungen. Beim App-Resume, einem manuellen Refresh oder einer Realtime-Profiländerung bleiben das vorhandene Profil, die Navigation und der Screen-State erhalten; `isRefreshing` und `profileRefreshError` bilden den nicht-blockierenden Zustand ab. Ein fehlgeschlagener Hintergrundrefresh zeigt global einen wiederholbaren Hinweis. Schlägt dagegen der initiale Profilabruf fehl, startet der profilabhängige Gruppencheck keine zusätzliche Serverabfrage: Die Navigation bleibt vorsorglich gesperrt und zeigt eine einzige Profilfehlermeldung, deren Wiederholungsaktion zuerst das Profil lädt. Logout, Wechsel der Auth-User-ID oder eine erfolgreiche Serverantwort ohne Profil entfernen alte Profildaten dagegen sofort. Rollen stammen weiterhin ausschließlich aus dem serverseitigen Profil; RLS und geschützte RPCs bleiben auch bei vorübergehend veraltetem Client-State die Berechtigungsinstanz.

Der gleiche Provider registriert den nativen Linking-Listener für Passwort-Recovery. `detectSessionInUrl` bleibt am Supabase-Client deaktiviert, damit Links nicht pauschal als Login verarbeitet werden. `src/features/auth/password-recovery-link.ts` akzeptiert Recovery-Zugangsdaten nur auf `/reset-password`; der neue Passwort-Screen bleibt außerhalb der normalen Login-Weiterleitung erreichbar, obwohl die Recovery-Session technisch bereits authentifiziert ist.

## Navigation und Zugriffsschutz

| Route | Zugriff | Zweck |
| --- | --- | --- |
| `/onboarding` | öffentlich; beim ersten Öffnen der Tabs | lokales Einführungsvideo und Auswahl von Deutsch, Englisch oder Arabisch |
| `/login`, `/register` | öffentlich; vorhandene Session wird weitergeleitet | Anmeldung und Registrierung |
| `/forgot-password` | öffentlich | neutral formulierter Versand eines Recovery-Links |
| `/reset-password` | öffentlich; nur mit gültiger Recovery-Session änderbar | neues Passwort setzen und danach lokale Session entfernen |
| `/(tabs)` | öffentlich; für angemeldete Konten keine unbeantwortete blockierende Gruppenabfrage | Hauptnavigation |
| Tab `/` | wie Tabs | kompakte Vorschau des heutigen Tagesprogramms, Städte, hervorgehobene Orte sowie aktive Bus-, Status- und Fragerundenhinweise |
| Tab `/map` | wie Tabs | native Karte beziehungsweise Web-Fallback |
| Tab `/search` | wie Tabs | Katalogsuche und Filter |
| Tab `/bookmarks` | wie Tabs | lokal gespeicherte Orte und Reader-Inhalte |
| Tab `/settings` | wie Tabs | Theme, Sprache, Mitteilungen und Reader; Konto-/Adminaktionen fordern eine Anmeldung an |
| `/city/[city]` | öffentlich | Orte einer Stadt |
| `/place/[slug]` | öffentlich | Ortsdetail |
| `/reader/[slug]` | öffentlich | religiöser Reader |
| `/account` | Session, nicht blockiert | Kontodaten, Personenzahl und Kofferanzahl |
| `/bus` | Session; nur eigene kontogebundene Reisezuordnung | Buszuordnung, Generalalarm, Push-Einrichtung und gestufter Status für ein aktives Boarding |
| `/emergency` | Session; nicht durch eine offene Pflichtabfrage blockiert; Senden für jede Rolle, rollenbezogenes Postfach für medizinisches Personal und Organisationsteam | Notfall an ein Team mit Freitext, optionalem Ortsnamen und einmaliger Position; Postfach, Lesestatus und Push-Einrichtung |
| `/group` | Session; nur eigene Untergruppen, Standortanfrage nur für den jeweiligen Anführer | Gruppenmitglieder anzeigen und eine einmalige Standortanfrage beantworten oder ablehnen |
| `/guide` | Session; nur eigene kontogebundene Reisezuordnung | aktueller Programmpunkt, Treffpunkt, Navigation und Teilnehmerstatus |
| `/program` | Session | Wochenprogramm von heute bis zu den nächsten sechs Tagen, gegliedert nach Tag und Ablaufpunkt |
| `/about`, `/sources`, `/disclaimer` | öffentlich | Produkt- und Quellenhinweise |
| `/check-in` | Session; Konten ohne Adminrolle sind bei aktiver oder unsicherer Abfrage blockiert | verpflichtende Ja-/Nein-Antwort |
| `/question-round` | jede Session bei offener Runde | anonyme Frage absenden |
| `/admin` | Admin-Session | getrennte Punkte für Busmanagement, Reisegruppen und Anführerstandort, Kontofamilien, Generalalarm, Tagesprogramm, Reiseführung und Mehrziel-Navigation sowie Gruppenabfrage, Fragen und Benutzerübersicht |

Neue Hauptscreens unter `src/app` anlegen. Zentrale dynamische URLs über `src/features/navigation/routes.ts` erzeugen und Routenparameter mit `singleRouteParam` normalisieren. Geschützte Screens werden mit `RequireAuth` innerhalb des Screens abgesichert, damit ein Deep Link ohne Session gezielt `/login` samt geprüftem internem Rücksprungziel öffnet. Die Allowlist verhindert externe oder unbekannte Redirectziele. RLS und die serverseitigen RPC-Prüfungen bleiben unabhängig vom Client-Guard die eigentliche Sicherheitsinstanz.

## Lokale Daten und religiöse Inhalte

Die App bündelt derzeit:

- 15 Orte in `src/data/places.ts`
- 12 empfohlene Handlungen in `src/data/recommendedActs.ts`
- 5 Reader-Einträge in `src/data/religiousContent.ts`
- 6 Quellen-/Redaktionsreferenzen in `src/data/sourceReferences.ts`

Orte, empfohlene Handlungen und die vier Reader-Platzhalter bleiben `needs_review`. Reader-Texte liegen lokal ausschließlich als geordnete `TextParagraph`-Objekte vor, sodass Arabisch, Transliteration und `translation_de` nicht mehr aus getrennten Volltext-Strings per Zeilennummer zusammengeführt werden. `src/data/ziyaratAshura.ts` enthält den vom Projektinhaber als geprüft bestätigten vollständigen arabischen Text und die Transliteration in dieser Absatzstruktur; die bereitgestellten deutschen Übersetzungen stehen im jeweils selben Absatz, weitere Übersetzungsfelder bleiben leer. Ziyarat Ashura ist deshalb als `verified` und `approved_for_offline` freigegeben.

Verbindliche Inhaltsregeln:

- Keine Dua, Ziyarat, arabischen Texte, Transliterationen, Übersetzungen, Hadithe, historischen oder religiösen Aussagen erfinden.
- Ungeprüfte Volltexte nicht hinzufügen. Als deutscher Platzhalter gilt exakt: `Volltext wird nach Rechte- und Inhaltsprüfung ergänzt. Quelle siehe unten.`
- Jeder religiöse Inhalt braucht `sourceReferences` und `verificationStatus`.
- Jede empfohlene Handlung braucht eine Quelle oder `verificationStatus: "needs_review"`.
- Rechteprüfung und fachlich-religiöse Inhaltsprüfung sind getrennte Anforderungen.
- Einen Status nur nach dokumentierter qualifizierter Prüfung auf `verified` setzen.
- Religiöse Inhalte gehören in `src/data`, nicht direkt in UI-Komponenten oder Übersetzungsdateien.
- Disclaimer, Quellenansicht und sichtbare Prüfstatus dürfen nicht entfernt oder verharmlost werden.

`src/data/catalog.ts` durchsucht lokalisierte Orte, Inhalte, Handlungen und deren Quellen. Die Suche normalisiert lateinische Diakritika sowie häufige arabische Zeichenvarianten. Handlungen ohne Reader-Inhalt bleiben sichtbar, sind aber nicht fälschlich mit einem anderen Text verlinkt. IDs und Slugs sind persistente Referenzen; bei den korrigierten Platzhalter-Slugs existieren deshalb Legacy-Aliase und eine Bookmark-Migration.

## Internationalisierung und RTL

- Unterstützte Sprachen: `de`, `en`, `ar`.
- UI-Texte liegen derzeit gemeinsam in `src/features/i18n/i18n.tsx`.
- Übersetzungen der Fachdaten liegen in `src/features/i18n/localizedData.ts`.
- Deutsch ist Fallback-Sprache.
- Arabisch setzt `isRTL`, aber einzelne technische Eingaben wie E-Mail bleiben absichtlich LTR.
- Jeder neue nutzerseitige Text muss in allen drei Wörterbüchern ergänzt werden.
- Dynamische Inhaltsdaten nicht als UI-Übersetzung duplizieren; die vorhandenen `localize*`-Funktionen verwenden.

## Lokale Persistenz

`src/features/storage/persistentState.ts` stellt pro Schlüssel einen gemeinsamen externen Store bereit und serialisiert JSON geordnet über AsyncStorage. Jeder Schlüssel besitzt einen Laufzeitparser; beschädigte oder veraltete Werte fallen sicher auf Standardwerte zurück. Hydration kann keine neuere Bedienaktion überschreiben, mehrere gleichzeitig montierte Screens bleiben synchron und Schreibvorgänge behalten ihre Reihenfolge. Aktuelle Schlüssel:

| Schlüssel | Inhalt |
| --- | --- |
| `ziyara.language` | `de`, `en` oder `ar` |
| `ziyara.onboarding.completed` | ob die einmalige Sprachauswahl abgeschlossen wurde |
| `ziyara.theme-mode` | `system`, `light` oder `dark` |
| `ziyara.bookmarks` | Keys wie `place:<slug>` und `content:<slug>` |
| `ziyara.reader.preferences` | Sichtbarkeit und getrennte Schriftgrößen für Arabisch, Transliteration und deutsche Übersetzung; ältere Werte werden validiert migriert |
| `ziyara.reader.positions` | Scrolloffset je Reader-Slug |
| `ziyara.trip-guidance.outbox` | benutzerspezifische, noch nicht übertragene Treffpunktmeldungen |
| `ziyara.notifications.disabled` | ob Push-Mitteilungen und lokale Generalalarm-Erinnerungen auf diesem Gerät ausdrücklich ausgeschaltet sind |
| `ziyara.general-alarm.expo-push-token` | zuletzt serverseitig registrierter Expo-Push-Token des Geräts für eine bestmögliche Abmeldung |

Der Reader speichert und restauriert Positionen beim erneuten Öffnen. Nichtkritische lokale Speicherfehler fallen auf den In-Memory-Zustand zurück; serverseitige Auth-, Profil- und Pflichtabfragefehler besitzen sichtbare beziehungsweise fail-closed Zustände.

Alle Datenbank-/Read-RPC-Lesezugriffe laufen über `src/features/network/supabase-read.ts`. Der Wrapper setzt mit der vom installierten Supabase-SDK unterstützten `abortSignal`-Methode einen Timeout von 10 Sekunden und klassifiziert Fehlschläge als `offline`, `timeout` oder `server`. Die UI zeigt diese Zustände getrennt von laufendem Laden an. Schreib-RPCs bleiben davon getrennt, damit ein lokaler Timeout nicht fälschlich behauptet, eine möglicherweise serverseitig ausgeführte Mutation sei abgebrochen worden.

## Supabase-Datenmodell und Sicherheit

`src/domain/database.ts` ist die manuell gepflegte TypeScript-Abbildung des Schemas. Jede Schemaänderung benötigt eine neue vorwärtsgerichtete Migration und die parallele Aktualisierung dieser Typen.

Aktuelle Tabellen:

- `profiles`: App-ID (`int8`), Auth-UUID, Anzeigename, `member_type`, `party_size`, `luggage_count`, `sim_card_count`, optionale Kontofamilie, Rolle und Zeitstempel.
- `account_families`: vom Admin benannte Gruppierung eigenständiger App-Konten, unabhängig von Reisegruppen und Personenzahl.
- `group_checks`: freie Frage, Admin-Profil und Öffnungs-/Schließzeit.
- `group_check_responses`: genau eine änderbare Ja-/Nein-Antwort pro Profil und Abfrage.
- `question_rounds`: Öffnungs-/Schließzeit einer anonymen Runde.
- `anonymous_questions`: Fragetext und Bearbeitungsstatus ohne Profil-/User-Fremdschlüssel.
- `question_submission_limits`: temporäre, clientseitig nicht lesbare Anzahl je Profil und offener Runde; ohne Fragetext, Frage-ID oder Zeitstempel.
- `role_assignment_audit`: clientseitig nicht lesbare Nachvollziehbarkeit tatsächlicher Rollenänderungen durch mehrere Admins.
- `trips`: aktive oder archivierte Reise; durch einen Partial-Unique-Index höchstens eine aktive Reise.
- `trip_buses`: benannte Busse, Sortierung und verpflichtend im aktuellen Workflow bestimmter, kontogebundener Busführer innerhalb einer Reise.
- `trip_participants`: kontogebundene Reisezuordnung mit Anzeigename, Bus und optionalem Kontofamilien-Snapshot. `participant_code` bleibt als intern erzeugter Legacy-Schlüssel für bestehende Relationen erhalten, ist aber kein UI-Feld.
- `bus_boardings`: Abfahrt mit geplantem Zeitpunkt und Öffnungs-/Schließzeit; höchstens ein offenes Boarding je Reise.
- `bus_boarding_responses`: letzter Status je Boarding und kontogebundener Reisezuordnung.
- `bus_boarding_escalations`: letzte ausdrückliche manuelle Eskalation je Boarding und kontogebundener Reisezuordnung.
- `push_notification_devices`: private, profilgebundene Expo-Push-Tokens mit Plattform und Sprache; keine Client-Leserechte.
- `general_alarm_notification_attempts`: privates Idempotenz- und Expo-Annahmeprotokoll je Gerät, Teilnehmer, Stufe und Erinnerungsfenster.
- `emergency_requests`: dauerhafte Notfallmeldung mit Absender-Snapshot, Zielteam, Anliegen und optionalem Text-/Koordinatenstandort.
- `emergency_request_recipients`: beim Absenden materialisierte Teamempfänger mit individuellem Lesestatus.
- `emergency_notification_attempts`: privates, idempotentes Expo-Annahmeprotokoll je Notfallmeldung und Empfängergerät.
- `trip_guidance_updates`: versionierter aktueller Programmpunkt mit Ort, Abfahrt, Treffpunkt, Koordinaten und organisatorischen Hinweisen.
- `trip_guidance_responses`: letzter Treffpunktstatus je Programmpunkt und kontogebundener Reisezuordnung einschließlich ausdrücklicher Problemübernahme.
- `trip_navigation_destinations`: mehrere aktive, benannte Karten- und Navigationsziele je Reise mit optionalem Orientierungshinweis und archivierter Entfernung.
- `trip_daily_programs`: genau ein veröffentlichter organisatorischer Ablauf je Reise und Kalenderdatum mit optionaler Überschrift.
- `trip_groups`: benannte Untergruppen der aktiven Reise mit genau einer kontogebundenen Reisezuordnung als Anführer.
- `trip_group_members`: atomare Zuordnung kontogebundener Reisezuordnungen zu höchstens einer Untergruppe.
- `trip_group_location_requests`: genau eine aktuelle, zustimmungsbasierte Standortanfrage je Untergruppe mit `pending`, `shared` oder `declined` und kurzzeitig lesbaren Koordinaten.
- `religious_contents`: Metadaten, Quellen-, Rechte- und Prüfstatus für optional serverseitig veröffentlichte Reader-Inhalte.
- `religious_text_paragraphs`: eindeutig positionierte Absätze; Arabisch, Transliteration und deutsche Übersetzung liegen untrennbar in derselben Zeile.

Nach Anwendung der Notfall- und Reader-Migration existieren achtundzwanzig Anwendungstabellen im `public`-Schema. Die zuvor bestehenden Tabellen bleiben vollständig erhalten; ebenso `profiles.id`, `profiles.user_id`, `group_check_responses.id` und `member_type`.

Wichtige RPCs:

- `is_admin`
- `admin_list_users`
- `admin_list_account_families`, `admin_upsert_account_family`, `admin_delete_account_family`
- `admin_set_user_role`
- `can_delete_account` (nur `service_role`; enger Vorabcheck für die Edge Function)
- `start_group_check`, `close_group_check`, `respond_to_group_check`
- `admin_group_check_results`
- `open_question_round`, `close_question_round`
- `submit_anonymous_question`, `set_anonymous_question_checked`
- `admin_create_trip`, `admin_archive_trip`, `admin_copy_trip_bus_setup`
- `admin_create_trip_bus_with_leader`, `admin_set_trip_bus_leader`
- `admin_assign_trip_person`, `admin_assign_trip_family`, `admin_start_bus_boarding`, `admin_close_bus_boarding`
- `respond_to_bus_boarding`, `admin_set_bus_boarding_status`
- `register_push_notification_device`, `unregister_push_notification_device`
- `admin_escalate_bus_boarding_participant`
- `can_dispatch_general_alarm`, `claim_due_general_alarm_notifications`, `complete_general_alarm_notification_attempts` (nur `service_role`)
- `submit_emergency_request`, `list_my_emergency_messages`, `mark_emergency_request_read`
- `claim_emergency_notification_attempts`, `complete_emergency_notification_attempt` (nur `service_role`)
- `admin_publish_trip_guidance`, `admin_update_trip_guidance`
- `respond_to_trip_guidance`, `admin_acknowledge_trip_guidance_problem`
- `can_read_current_trip_daily_program`, `admin_upsert_trip_daily_programs`
- `is_trip_group_member`, `is_trip_group_leader`, `get_trip_group_member_summaries`
- `admin_upsert_trip_group`, `admin_delete_trip_group`, `admin_request_trip_group_location`, `respond_to_trip_group_location`

RLS ist aktiviert. Privilegierte Aktionen laufen über `security definer`-Funktionen, die Admin- beziehungsweise Session-Berechtigungen selbst prüfen. Neue Funktionen müssen einen festen `search_path`, minimale Grants und explizite Auth-Prüfungen besitzen.

Die Migration `20260816000000_add_profile_member_type.sql` ergänzt die Bruder-/Schwester-Zuordnung. Sie übernimmt `member_type` aus validierten Auth-Metadaten und lässt das Feld für ältere Konten `null`, statt eine falsche Zuordnung zu erfinden.

Die Migrationen `20260816010000_add_staff_role_values.sql` und `20260816020000_add_admin_role_assignment.sql` ergänzen medizinisches Personal und Organisationsteam-Mitglieder sowie die serverseitig geschützte Rollenvergabe. Die Enum-Erweiterung und die RPC liegen absichtlich in getrennten Migrationen, damit neue PostgreSQL-Enumwerte erst nach einem Commit verwendet werden.

Die Migration `20260816030000_allow_all_roles_participate.sql` öffnet die Antwort-RPCs für alle angemeldeten Profile. Admins können dadurch an Statusabfragen und anonymen Fragerunden teilnehmen, ohne dass ihre privilegierten App-Bereiche blockiert werden.

Die Migration `20260816040000_minimize_admin_user_list.sql` reduziert `admin_list_users` auf Name, vertretene Personenzahl und Rolle. Nur die für eine Rollenänderung notwendige interne Auth-UUID wird zusätzlich übertragen; E-Mail-Adresse, Profil-ID, Zuordnung und Anmeldedaten werden nicht mehr ausgeliefert.

Die Migration `20260816050000_harden_multi_admin_and_questions.sql` serialisiert konkurrierende Rollenwechsel und protokolliert echte Änderungen, sperrt Antworten transaktionssicher gegen das gleichzeitige Schließen einer Runde und begrenzt anonyme Einsendungen auf fünf pro Profil und Runde. Die temporären Zähler werden beim Schließen gelöscht.

Die Migration `20260817000000_allow_admin_role_assignment.sql` erlaubt Admins, auch die Rolle `admin` zu vergeben und bestehende Admins umzustufen. Eine transaktionsweite Advisory-Sperre und eine erneute Berechtigungsprüfung schützen konkurrierende Änderungen; der letzte Admin kann nicht herabgestuft werden. Profiländerungen werden über Realtime veröffentlicht, damit Rollen in bereits geöffneten Sitzungen aktualisiert werden; beim App-Fokus wird das eigene Profil zusätzlich neu geladen.

Die Migration `20260826000000_expand_group_check_results.sql` paart den Shared Row Lock einer Antwort mit einem expliziten exklusiven Row Lock beim Schließen. Dadurch wird eine parallele Antwort entweder vollständig vor dem Schließen gespeichert oder sieht anschließend den geschlossenen Check und schlägt fehl. `admin_group_check_results` liefert über einen `LEFT JOIN` jedes aktuelle Profil mit `display_name`, `party_size` und einer nullable Antwort; `null` bedeutet ausdrücklich noch nicht geantwortet.

Die Migration `20260826010000_drop_unused_group_check_answer_index.sql` entfernt ausschließlich `group_check_responses_check_answer_idx`. Keine produktive Abfrage filtert oder aggregiert nach `answer`: Eigene Antworten werden über `check_id` und `profile_id` gelesen, die Admin-RPC verbindet dieselben Spalten und die Ja-/Nein-/Offen-Gruppierung erfolgt anschließend im Client. Der Unique-Constraint auf `(check_id, profile_id)` stellt den dafür passenden Index bereits bereit. Alle sieben Tabellen sowie `profiles.id`, `profiles.user_id`, `group_check_responses.id` und `member_type` bleiben unverändert erhalten.

Die Migration `20260826020000_protect_account_deletion.sql` schützt Löschungen auf `auth.users` mit derselben transaktionsweiten Advisory-Sperre wie Rollenänderungen. Der letzte Administrator kann deshalb auch bei paralleler Löschung oder gleichzeitiger Umstufung nicht entfernt werden. Das Profil, Gruppenantworten und temporäre Fragenlimits werden über bestehende Cascades gelöscht; erhaltene Gruppenchecks verlieren den Erstellerbezug. Rollen-Auditereignisse bleiben als nicht identifizierende Historie erhalten: `target_user_id` wird vor dem Löschen auf `null` gesetzt und `changed_by_profile_id` wird über den bestehenden Fremdschlüssel ebenfalls anonymisiert.

Die Migration `20260826021000_add_account_deletion_precheck.sql` ergänzt den ausschließlich für `service_role` ausführbaren Vorabcheck `can_delete_account`. Er liefert der Edge Function eine verständliche Last-Admin-Ablehnung; der Trigger auf `auth.users` bleibt wegen möglicher Parallelität die endgültige transaktionale Sicherheitsinstanz. `supabase/functions/delete-account` akzeptiert nur `POST` mit leerem Body, prüft den Access Token über `auth.getUser(accessToken)` und ruft `auth.admin.deleteUser` ausschließlich mit der verifizierten ID auf. Privilegierte Schlüssel werden nur aus der Edge-Function-Umgebung gelesen. `verify_jwt = false` betrifft nur den vorgeschalteten Legacy-Gateway-Check; die Function-eigene Bearer-Token-Prüfung bleibt zwingend.

Die additive Migration `20260827000000_add_bus_management.sql` ergänzt Reise, Busse, physische Teilnehmer-IDs, Boardings und Statusantworten. Direkte Client-Schreibrechte sind entzogen; Admin- und Teilnehmermutationen laufen ausschließlich über serverseitig authentifizierte RPCs. RLS zeigt normalen Konten nur eigene verknüpfte IDs und Antworten, während Admins die gesamte Reise sehen. Antwort und Schließen verwenden kompatible Row Locks für transaktionale Parallelität. Eine Kontolöschung setzt die optionale Profilverknüpfung auf `null`, lässt die physische Teilnehmerhistorie aber bestehen. Bei einem Auth-/Function-Grant-Fehler erneuert der Bus-Client die Supabase-Session und wiederholt die Statusmutation genau einmal, sofern dieselbe User-ID angemeldet bleibt; ein endgültiger Fehler löst einen autoritativen Refresh aus und wird ohne sensible Serverdetails als Auth-, geschlossenes Boarding-, Zuordnungs-, Offline- oder Serverzustand angezeigt.

Die additive Migration `20260906000000_redesign_bus_trip_assignments.sql` stellt den aktuellen Bus-Adminflow auf registrierte Personen und ganze Kontofamilien um. `trip_participants.participant_code` bleibt unverändert als intern generierter Legacy-Schlüssel bestehen, wird im Client aber weder eingegeben noch angezeigt. `assignment_family_id` markiert eine gemeinsam ausgewählte Familie, während für die statusfähige Kontobindung weiterhin genau ein Zuordnungsdatensatz je betroffenem Profil angelegt wird. `trip_buses.leader_participant_id` hält den registrierten Busführer. Neue Admin-RPCs weisen Personen oder Familien atomar zu, erstellen einen Bus nur zusammen mit einem Führer, ändern Führer und kopieren Busse, Führer und Zuordnungen aus einer geschlossenen Reise in eine neue aktive Reise. Boardingantworten, Eskalationen, Tagesprogramme, Ziele, Reiseführung und Reisegruppen werden bei der Übernahme bewusst nicht kopiert. Der Auftraggeber hat am 6. September 2026 gemeldet, den Datenbank-Push ausgeführt zu haben; dieser Status konnte in der Codex-Umgebung wegen des fehlenden Supabase-CLI-Logins nicht unabhängig gelesen werden. Lokal wurde die Migration in diesem Durchlauf nicht ausgeführt, weil der Start der Docker-/Supabase-Umgebung nicht freigegeben wurde.

Die additive Migration `20260827120000_add_trip_guidance.sql` ergänzt versionierte Programmpunkte und Teilnehmermeldungen. Neue Veröffentlichungen schließen den vorherigen Programmpunkt transaktionssicher über eine Sperre der aktiven Reise; Treffpunktkorrekturen aktualisieren dagegen denselben Datensatz. Teilnehmerantworten sperren den offenen Programmpunkt kompatibel gegen einen gleichzeitigen Wechsel. Direkte Client-Schreibrechte sind entzogen, RLS zeigt Konten nur eigene Statusmeldungen und Admins die Gesamtübersicht. Nur ein aktueller `problem`-Status kann über die Admin-RPC ausdrücklich übernommen werden; eine spätere Teilnehmeränderung entfernt die alte Übernahme. Die Migration ist lokal und remote angewandt und mit 24 zusätzlichen pgTAP-Assertions geprüft.

Die additive, lokal und remote angewandte Migration `20260828120000_add_trip_navigation_destinations.sql` ergänzt mehrere Navigationseinträge je aktiver Reise. Direkte Client-Schreibrechte bleiben entzogen; RLS zeigt aktive Ziele ausschließlich Admins und Mitgliedern der zugehörigen Reise. Admin-RPCs legen Ziele an beziehungsweise ändern sie und archivieren sie nach ausdrücklicher Bestätigung. Ein vorhandener offener Programmtreffpunkt mit Koordinaten wird bei der Migration als erstes Ziel übernommen. Die Tabelle wird in Realtime aufgenommen.

Die additive, lokal und remote angewandte Migration `20260828130000_add_daily_program.sql` ergänzt genau ein Tagesprogramm je Reise und Kalenderdatum. Alle angemeldeten Konten dürfen die Programme der aktiven Reise lesen, auch wenn sie noch keinem Bus zugeordnet sind. Batch-Upserts sind auf vierzehn unterschiedliche Tage begrenzt, sperren die aktive Reise und dürfen nur von Admins ausgeführt werden. Direkte Client-Schreibrechte bleiben entzogen; die Tabelle wird in Realtime aufgenommen.

Die additive, lokal und remote angewandte Migration `20260830000000_add_trip_groups_and_location_requests.sql` ergänzt Untergruppen, eindeutige Mitgliedschaften und genau eine aktuelle Standortanfrage je Gruppe. Nur Admin-RPCs dürfen Gruppen bilden, ändern, löschen und Anführer anfragen; nur der aktuell kontogebundene Anführer darf eine offene Anfrage teilen oder ablehnen. Jede App-Rolle einschließlich `admin` darf über ihre Reisezuordnung Gruppenmitglied oder Anführer sein. Normale Gruppenmitglieder sehen die Gruppenzusammensetzung, aber niemals die Standortanfrage oder Koordinaten. Geteilte Koordinaten sind per zeitabhängiger RLS höchstens 15 Minuten lesbar und werden bei erneuter Anfrage, Gruppenänderung oder Löschung entfernt. Die drei Tabellen sind in Realtime aufgenommen; 35 neue pgTAP-Assertions prüfen Grants, Rollen, Adminmitgliedschaft, Member-Summary-RPC, Freigabe, zeitlichen RLS-Ablauf, Überschreiben und Löschung.

Die lokal und remote angewandte Migration `20260830010000_add_account_families_and_luggage.sql` ergänzt `profiles.luggage_count` mit einem Bereich von `0` bis `50`, übernimmt die Kofferanzahl bei neuen Registrierungen aus validierten Auth-Metadaten und lässt ältere Konten bei `0`. Nutzer dürfen nur die eigene Kofferanzahl ändern. `account_families` gruppiert eigenständige App-Konten; `profiles.family_id` erzwingt höchstens eine Familie pro Konto. Nur authentifizierte Admin-RPCs legen Familien an, ändern oder löschen sie und verschieben ausgewählte Konten atomar. Mitglieder dürfen den Namen ihrer eigenen Familie lesen, nicht jedoch fremde Familien oder deren Konten. 32 neue pgTAP-Assertions prüfen Metadaten, Grants, RLS, minimale Adminlisten, Verschieben und Löschen.

Die lokal und remote angewandte Migration `20260902000000_add_profile_sim_card_count.sql` ergänzt `profiles.sim_card_count` mit einem Bereich von `0` bis `50`, übernimmt den Wert bei neuen Registrierungen aus validierten Auth-Metadaten und lässt bestehende Konten bei `0`. Nutzer dürfen über den bestehenden Eigenprofil-RLS-Schutz nur den eigenen Wert ändern. Die minimale Adminliste liefert zusätzlich `member_type` und `sim_card_count`, damit Konto-Zuordnungen und SIM-Bedarf einzeln sowie aggregiert sichtbar sind.

Die Migrationen `20260903000000_add_emergency_requests.sql`, `20260904000000_add_emergency_dashboard_and_duty.sql` und `20260904010000_require_emergency_location_label.sql` ergänzen Notfallmeldungen, materialisierte rollenbezogene Empfänger, Lesestatus, Diensteinteilungen und private Push-Versandversuche. Direkte Client-Schreibrechte sind entzogen; Senden und Gelesen-Markierung laufen über authentifizierte RPCs, während Push-Claims und -Abschlüsse ausschließlich `service_role` ausführen darf. RLS zeigt Meldungen nur dem Absender und den beim Absenden festgehaltenen Empfängern. Alle drei Migrationen sind remote angewandt; `dispatch-emergency-alert` und `dispatch-emergency-duty` sind remote aktiv.

Die additive Migration `20260914000000_add_structured_religious_content.sql` ergänzt normalisierte Reader-Metadaten und geordnete Absatzzeilen. `20260914010000_publish_ziyarat_ashura.sql` veröffentlicht die 142 geprüften Ziyarat-Ashura-Absätze in genau dieser Struktur; alle drei Felder sind Pflicht, wobei Instruktionsabsätze und noch nicht bereitgestellte deutsche Übersetzungen leer bleiben dürfen, solange mindestens ein Textbestandteil gefüllt ist. Anonyme und angemeldete Clients besitzen ausschließlich Leserechte auf veröffentlichte Inhalte; ein Datenbank-Constraint und RLS verlangen dafür `verified`, `approved_for_offline`, Prüfer und Prüfzeit. Der Reader startet weiterhin sofort mit gebündelten Offline-Daten und ersetzt sie nur dann durch eine vollständig geladene, veröffentlichte Serverfassung. Beide Migrationen sind lokal und remote angewandt; die erste wurde mit pgTAP geprüft.

Die additive Migration `20260827130000_add_bus_boarding_read_status.sql` ergänzt den Enumwert `read` in einer eigenen Transaktion, damit PostgreSQL ihn erst nach dem Enum-Commit verwendet. `20260827140000_add_general_alarm.sql` ergänzt Fünf-Minuten-/Dringlichkeitsparameter, private Push-Geräte und Versandfenster sowie manuelle Boarding-Eskalationen. `20260827150000_enforce_general_alarm_status_order.sql` erzwingt `read` → `on_way` → `boarded` auch im Teilnehmer-RPC, serialisiert parallele Antworten je physischer ID und lässt administrative Korrekturen weiter zu. Direkte Token- und Versandprotokoll-Leserechte sind entzogen; normale Nutzer registrieren ausschließlich das eigene Gerät, Admins sehen nur Eskalationen, und nur `service_role` beansprucht beziehungsweise vervollständigt Push-Fenster. `dispatch-general-alarm` ist remote aktiv, prüft Admin- oder Scheduler-Autorisierung und sendet gruppierte, lokalisierte Nachrichten an den Expo Push Service. `GENERAL_ALARM_CRON_SECRET` ist als Function-Secret gesetzt und zusätzlich im Supabase Vault hinterlegt; der Cronjob `dispatch-general-alarm-every-minute` läuft minütlich und antwortete bei der Einrichtung mehrfach mit HTTP 200.

Am 14. September 2026 wurden lokale und Remote-Migrationsliste unabhängig mit der verknüpften Supabase-CLI geprüft. Beide sind bis einschließlich `20260914010000` synchron; `db push --linked --dry-run` meldete die Remote-Datenbank als aktuell. Keine bestehende Migration wurde verändert, gelöscht oder zusammengefasst. Die Edge Functions `delete-account`, `dispatch-general-alarm`, `dispatch-emergency-alert` und `dispatch-emergency-duty` sind remote aktiv und verwenden ihre jeweilige interne Autorisierungsprüfung. Die Remote-Auth-Redirect-Allowlist wurde nicht verändert.

Für Push ist das EAS-Projekt `@hadi_ea/al-batoul` mit der Projekt-ID aus `app.json` und dem nativen Identifier `de.albatoul.ziyara` verbunden. EAS zeigt einen APNs-Push-Key und einen FCM-V1-Service-Account. Ein signierter iOS-Preview-Build wurde am 14. September 2026 erfolgreich erstellt; der Android-Preview-Build wurde gestartet. Zum Prüfzeitpunkt waren noch keine Expo-Push-Geräte remote registriert, daher bleibt die tatsächliche Gerätezustellung offen. Expo Enhanced Push Security und `EXPO_ACCESS_TOKEN` sind bewusst noch nicht aktiviert. Remote-Zustand kann sich unabhängig vom Repository ändern: vor späteren Annahmen mit autorisiertem Zugriff `npx supabase migration list --linked` und `npx supabase functions list` prüfen. Migrationen, Functions, Secrets, Scheduler und Auth-Redirects nur innerhalb eines ausdrücklich beauftragten Implementierungs- oder Deployment-Schritts remote ändern.

## Kapazität für die Reisegruppe

- Zielgröße sind ungefähr 100 Konten zuzüglich mehrerer Admin-/Mitarbeitergeräte.
- Der Supabase-Client teilt mehrere Realtime-Kanäle über eine Verbindung. Aktuelle Tarifgrenzen trotzdem vor der Reise im Dashboard gegen die erwarteten gleichzeitig aktiven Geräte prüfen.
- Durch die gestaffelten Fallback-Intervalle entstehen bei 100 dauerhaft aktiven Clients mit Bus-, Reisegruppen-, Tagesprogramm- und Reiseführungsprovider grob 590 Fallback-Leseabfragen pro Minute ohne aktive Pflichtabfrage und etwa 670 pro Minute mit aktiver Pflichtabfrage. Die Schätzung zählt die drei parallelen Reisegruppen-Reads pro Refresh einzeln. Realtime und App-Fokus sind der Primärweg; die Offline-Warteschlange versucht nicht in einer engen Schleife erneut zu senden.
- Der produktive Generalalarm-Scheduler soll den Dispatcher einmal pro Minute aufrufen. Die Datenbank beansprucht je Gerät/Teilnehmer/Stufe/Fünf-Minuten-Slot höchstens einen Versuch; ein parallel geöffnetes Adminpanel kann deshalb keine doppelten Nachrichten für denselben Slot erzeugen.
- Antwortwellen werden in den Adminpanels 250 ms gebündelt. Die Benutzer-RPC wird in 200er-Seiten geladen, die Fragenansicht zeigt maximal 50 weitere Einträge pro Schritt.
- Ein realer Lasttest mit dem gewählten Supabase-Tarif, Reise-WLAN/Mobilfunk und den Zielgeräten bleibt vor Freigabe erforderlich.

## Plattformunterschiede

- iOS-Karte: `src/features/map/MapScreen.tsx` und `MapCanvas.tsx` mit Apple Maps über `react-native-maps` und Expo Location. Gebäude-, Indoor-, POI- und Verkehrsebenen sind deaktiviert; die Kartenmitte wird auf die Irak-Bounds zurückgeführt und kleine Stadtkarten sind statisch, während MapKit seinen Systemcache selbst verwaltet.
- Android-Karte: derselbe Screen-State mit `MapCanvas.android.tsx` und Leaflet/OpenStreetMap direkt in `LeafletMapView.tsx`. Das Leaflet-JavaScript und -CSS wird aus der installierten Version durch `scripts/generate-leaflet-assets.mjs` lokal in das App-Bundle übernommen und zusammen mit sicher serialisierten Kartendaten als HTML an `react-native-webview` übergeben. Native Interaktionen laufen über eine kleine validierte `postMessage`-Bridge. Expo DOM wird nicht verwendet. `react-native-maps` und `@expo/dom-webview` sind auf Android vom Autolinking ausgeschlossen; `react-native-webview` und `@expo/dom-webview` bleiben umgekehrt auf iOS ausgeschlossen.
- Webkarte: `src/features/map/MapScreen.web.tsx` mit schematischer Karte, Browser-Geolocation und Liste.
- Die Stadtkarte besitzt getrennte iOS-, Android- und `.web.tsx`-Pfade. Die kleinen iOS-/Android-Karten sind nicht verschiebbar, damit sie nur die benötigten Umgebungskacheln laden.
- Die administrative Treffpunktauswahl besitzt getrennte iOS-, Android- und `.web.tsx`-Varianten: iOS zeigt Apple Maps, Android Leaflet mit einem verschiebbaren Marker und Web eine klickbare Irak-Koordinatenfläche. Alle können nach ausdrücklicher Standortfreigabe einmalig den aktuellen Gerätestandort übernehmen.
- Platform-spezifische Implementierungen bevorzugen, wenn ein natives Modul Web-Exporte brechen würde.
- Gebündelte Katalogdaten und Bilder sind offline verfügbar. Supabase-Funktionen und Kartenkacheln sind nicht vollständig offlinefähig. Android begrenzt Leaflet auf den Irak, lädt Tiles erst bei sichtbarem Bedarf, aktualisiert sie erst nach beendeter Bewegung, behält einen kleinen Puffer im Speicher und nutzt den normalen persistenten HTTP-Cache der WebView. iOS nutzt den von MapKit verwalteten Systemcache; die App implementiert keinen separaten Tile-Downloader.
- Das gebündelte Erststartvideo wird mit `expo-video` auf iOS, Android und Web bildschirmfüllend als Hintergrund abgespielt und läuft bewusst stumm in Schleife. Eine abgedunkelte Ebene hält die Sprachauswahl lesbar; ein Wiedergabefehler blockiert sie nicht.
- Generalalarm-Push und lokale Benachrichtigungen sind nativ; die Webversion zeigt den Statusfluss ohne Push. Angemeldete Nutzer können Push-Mitteilungen und lokale Generalalarm-Erinnerungen zentral in den Einstellungen ein- oder ausschalten; die Auswahl bleibt lokal erhalten, „Aus“ meldet das gespeicherte Gerät bestmöglich serverseitig ab und entfernt geplante Erinnerungen. In Expo Go lädt die App `expo-notifications` nicht, damit dessen Android-Fehler für nicht unterstützten Remote-Push den Router nicht mitreißt; die Benachrichtigungsintegration ist dort vollständig deaktiviert und der Zustand wird ausdrücklich angezeigt. Remote-Push und die Generalalarm-Erinnerungen der App erfordern einen nativen Development-/Produktionsbuild. Kein Plattformpfad behauptet, Lautlosmodus, Fokus, ausgeschaltete Geräte oder deaktivierte Benachrichtigungen zuverlässig umgehen zu können.
- Notfall-Push nutzt dieselbe profilgebundene Expo-Geräteregistrierung und einen eigenen Android-Kanal mit maximaler Wichtigkeit. Web und Expo Go behalten das vollständige Postfach, bieten aber keinen Remote-Push. Auch Notfall-Push ist bestmöglich und kann Systemzustände oder Geräteeinstellungen nicht umgehen.

## UI-Konventionen

- Nutzerseitige UI bleibt in allen unterstützten Sprachen vollständig übersetzt.
- Ruhige, funktionale Oberfläche statt Marketing-Landingpage.
- Theme-Tokens aus `src/constants/theme.ts` und `useTheme()` verwenden; keine verstreuten Farbwerte.
- Wiederverwendbare Elemente in `src/components/ui` ablegen.
- Große Tap-Ziele, Accessibility-Rollen/-Labels, verständliche Lade-, Leer-, Fehler- und Permission-Zustände bereitstellen.
- `Screen` für normale scrollbare Seiten verwenden. Lange virtuelle Listen wie im Adminscreen bleiben `FlatList`-basiert.
- Light/Dark, kleine Mobilbreiten, Web/Desktop, dynamische Schrift und arabische Darstellung mitprüfen.

## Verbindlicher Arbeitsablauf für eine LLM

1. `AGENTS.md` und diese Datei vollständig lesen.
2. `git status --short` prüfen und fremde Änderungen erhalten.
3. Relevante Laufzeitdateien und Migrationen lesen; nicht nur dem alten Plan folgen.
4. Änderungen möglichst klein und typensicher halten; kein `any` zum Kaschieren von Fehlern.
5. Bei neuen Profil-/Backendfeldern Migration, `src/domain/database.ts`, Select-Listen, Auth-Metadaten, UI und Adminanzeige gemeinsam prüfen.
6. Bei neuen UI-Texten Deutsch, Englisch und Arabisch ergänzen.
7. Bei Navigationsänderungen Auth-, Admin- und Blockade-Guards sowie Web-Export prüfen.
8. Keine religiösen Inhalte ohne Quellen- und Prüfworkflow ergänzen.
9. Relevante Fehler-, Lade-, Leer- und Offlinezustände umsetzen.
10. Diese Datei aktualisieren, wenn sich der hier dokumentierte Gesamtzustand ändert.
11. Prüfungen ausführen und im Handoff exakte Ergebnisse, geänderte Dateien, Migrationsbedarf und bekannte Risiken nennen.

## Qualitätsprüfungen

Für bedeutsame Änderungen:

```bash
npm run validate
npx expo-doctor@latest
npx expo export --platform web
npx expo export --platform ios
npx expo export --platform android
npm audit
```

Für Datenbankänderungen zusätzlich:

```bash
npx supabase start
npx supabase db reset --local
npx supabase db lint --local --level warning
npx supabase test db --local
```

`npm test` umfasst derzeit 182 Jest-Tests in 36 Suites. Abgedeckt sind unter anderem der validierte Onboardingstatus und seine Navigationsentscheidung, die Familiengruppierung und Summenbildung der Admin-Benutzerliste, AuthContext einschließlich Koffer- und SIM-Karten-Registrierung und -änderung, BusManagementContext einschließlich Session-Refresh-Retry und Fehlerklassifizierung, DailyProgramContext, der validierte benutzergebundene Programm-Cache, lokale Kalenderdatumslogik und die Zerlegung mehrzeiliger Ablaufpunkte, Generalalarm-Stufen/Erinnerungsplanung und Dispatcher-Autorisierung, TripGuidanceContext einschließlich Offline-Vormerkung, Wiederholung, Problemübernahme und benutzergebundenem Neustart-Cache für Reiseziele, Reisegruppen-Zustandsaufbau, Standortablauf und Fehlerklassifizierung, GroupCheckContext einschließlich des Rollenlade-Timings, QuestionRoundContext, die Navigationsübergabe an Karten-Apps, Koffer- und SIM-Kartenzahlvalidierung, Reader-Präferenzmigration und strukturiertes Absatzmapping, Persistenz-Races und Speicherfehler, der gerenderte `RequireAuth`-Guard, der öffentliche Providerstart einschließlich Reisegruppen ohne Supabase-Zugriff, Recovery-/Account-Löschverträge sowie die globale Error Boundary. `npm run test:coverage` beziehungsweise `npm run validate` erzwingt mindestens 50 % globale Line Coverage und jeweils 80 % für die fünf Kernkontexte. Der vollständig ausgeführte lokale Stand vom 14. September 2026 liegt bei 85,05 % global, 91,56 % AuthContext, 93 % BusManagementContext, 90,36 % DailyProgramContext, 87,86 % TripGuidanceContext, 95,34 % GroupCheckContext und 95,65 % QuestionRoundContext.

Unter `supabase/tests/database` definieren zusätzlich 252 pgTAP-Assertions in dreizehn SQL-Testdateien Prüfungen der RLS-/RPC-/Parallelitätsregeln sowie Cascades, Audit-Anonymisierung, Function-Grants, Kontofamilien, Koffer- und SIM-Karten-Registrierung und -änderung, strukturierte Reader-Absätze, konkurrierende Account-Löschungen, beide Reihenfolgen von Boarding-Antwort gegen Schließung, die serverseitige Generalalarm-Stufenfolge, Token/Versandfenster/Eskalationen, den vollständigen Reiseführungs-Lebenszyklus, das atomare Tagesprogramm-Batch und die Reisegruppen-/Anführerstandortgrenzen einschließlich Adminmitgliedschaft und 15-Minuten-Ablauf. `npm run test:e2e` führt neun serielle Playwright-Smokes mit synthetischen Konten gegen die lokale Expo-/Supabase-/Mailpit-Umgebung aus: Registrierung/Login, Recovery-Link, Erststart mit Video, Sprache und Gastzugang bei abgebrochenen Supabase-Requests, Gruppencheck, anonyme Fragerunde, Busmanagement einschließlich der gestuften Generalalarm-Bestätigung, Mehrtagesprogramm von der kompakten Home-Vorschau bis zur Wochenansicht, Reiseführung mit Realtime-Treffpunktänderung und Problemübernahme sowie Rollenänderung. Der E2E-Start liest lokale Schlüssel bei neueren Supabase-CLI-Versionen über `supabase status -o env`, falls `start-secrets/docker.env` nicht erzeugt wird. `.github/workflows/ci.yml` führt bei Pushes und Pull Requests App-Validierung samt Coverage, Expo Doctor, getrennte Web-/iOS-/Android-Exports und einen Critical-Audit-Gate aus; der Datenbank-Job startet das lokale Schema aus Migrationen, prüft die 401-Auth-Gates beider Edge Functions, führt DB-Lint und SQL-Tests sowie danach die Playwright-Smokes aus.

Der letzte vollständige Prüfstand vom 14. September 2026: `npm run validate` bestand mit 182/182 Jest-Tests; Web-, iOS- und Android-Export waren erfolgreich. Nach den SDK-57-Patchupdates bestand Expo Doctor 21/21 Checks. Die vollständige lokale pgTAP-Suite bestand mit 252/252 Assertions. Der DB-Lint meldete weiterhin die bereits vorhandene mehrdeutige `profile_id`-Referenz in `admin_set_emergency_duty` sowie die ungelesene Variable `saved_assignment` in `admin_copy_trip_bus_setup`; die neue Reader-Migration erzeugte keinen zusätzlichen Befund. Ein signierter iOS-Preview-Build wurde erfolgreich erstellt, der Android-Preview-Build befand sich zuletzt in der EAS-Warteschlange. Die Playwright-E2E-Suite und die native Echtgeräteprüfung wurden in diesem Durchlauf nicht ausgeführt.

## Bekannte Lücken und Risiken

- Die App ist noch nicht vollständig store-releasefähig. Die folgenden Punkte sind konkrete Release-Blocker beziehungsweise notwendige Vorabnahmen, nicht bloß optionale Verbesserungen.
- Kuratierte Ortsinhalte, empfohlene Handlungen und die vier religiösen Platzhalter benötigen weiterhin qualifizierte Prüfung; Ziyarat Ashura wurde vom Projektinhaber als geprüft bestätigt.
- Die Veröffentlichungmigration `20260914010000_publish_ziyarat_ashura.sql` ist lokal und remote angewandt. Die identische gebündelte Absatzfassung bleibt der Offline-Fallback.
- Kartenkacheln sind offline nicht garantiert. Bereits vom Betriebssystem beziehungsweise der Android-WebView zwischengespeicherte Kacheln können wiederverwendet werden; es wird bewusst kein vollständiges Offline-Tilepaket vorinstalliert oder unkontrolliert vorabgeladen.
- Android verwendet die öffentlichen Standardkacheln von OpenStreetMap ohne API-Schlüssel oder Zahlungsdaten. Deren Tile Usage Policy, faire Nutzung, verpflichtende Attribution und fehlende Verfügbarkeitsgarantie sind zu beachten. Bei größerem Produktivverkehr ist ein eigener oder ausdrücklich freigegebener Tile-Dienst nötig. Wegen des Android-Autolinking-Ausschlusses von `react-native-maps` ist nach dieser Umstellung ein neuer Android-Build erforderlich.
- Finale Store-Metadaten und veröffentlichungsfertige Datenschutz-/Supportseiten fehlen. Externes Crash-Reporting ist nicht integriert.
- App-Icon, Web-Favicon, Android-Adaptive-/Benachrichtigungssymbol und Splash Screen verwenden ausschließlich die beiden bereitgestellten Markenassets. Ihre finale Darstellung muss noch in signierten iOS- und Android-Preview-Builds geprüft werden.
- Die nativen Identifier sind als `de.albatoul.ziyara` konfiguriert; finale Store-Metadaten und Produktionsfreigabe fehlen weiterhin.
- Die Recovery- und Account-Löschpfade sind lokal vollständig implementiert; Migrationen und Löschfunktion sind remote ausgerollt. Vor einem Release fehlen noch die Remote-Auth-Redirect-Allowlist sowie Recovery- und Löschtests auf einem signierten nativen Build mit einem ausdrücklich freigegebenen Testkonto.
- Kontofamilien, Kofferanzahl und SIM-Karten-Erweiterung sind im Client implementiert; die zugehörigen Migrationen `20260830010000` und `20260902000000` sind lokal und remote vorhanden. Es fehlen reale Tests von Registrierung, nachträglichen Mengenänderungen, Adminsummen und Familienverschiebung mit mehreren Konten auf kleinen iOS-, Android- und Weboberflächen.
- Das Busmanagement-Schema einschließlich `20260906000000_redesign_bus_trip_assignments.sql` ist lokal und remote vorhanden. Vor produktiver Nutzung fehlen weiterhin eine reale Adminprüfung der Familienauswahl und Übernahme sowie ein Last-/Mobilfunktest mit der Reisegruppe.
- Die Reisegruppen- und Anführerstandortfunktion ist im lokalen Client implementiert und die Migration `20260830000000_add_trip_groups_and_location_requests.sql` ist lokal und remote angewandt. Admins können über ihre kontogebundene Reisezuordnung Mitglied oder Anführer sein; diese Clientdarstellung liegt noch im lokalen Worktree. Die iOS-Berechtigungsbeschreibung in `app.json` nennt nun auch die ausdrückliche einmalige Freigabe an die Reiseleitung; diese App-Konfigurationsänderung erfordert einen neuen nativen Development-/Produktionsbuild. Vor produktiver Nutzung fehlen reale Tests von Adminmitgliedschaft, Realtime, Vordergrund-Standortberechtigung, Ablehnung, 15-Minuten-Ablauf und schwacher Verbindung auf iOS, Android und Web.
- Das Reiseführungsschema ist lokal und remote migriert sowie lokal vollständig getestet. Vor produktiver Nutzung sind ein neuer Client-Build sowie reale Tests von Realtime, einmaliger Standortfreigabe und Offline-Warteschlange erforderlich.
- Die Tagesprogramm- und Mehrzielmigrationen sind lokal und remote angewandt sowie lokal vollständig automatisiert getestet. Bereits installierte Apps benötigen weiterhin den aktualisierten Client; vor breiter produktiver Nutzung braucht das Tagesprogramm zusätzlich eine reale Prüfung von Realtime, Zeitzone und kleiner Mobilbreite.
- Das Generalalarm-Schema, die Dispatcher-Function, das Scheduler-Secret, der Supabase-Vault-Eintrag, der Minuten-Cronjob sowie APNs und FCM V1 sind eingerichtet. Der iOS-Preview-Build ist fertig; Android wurde gestartet. Vor produktiver Push-Nutzung fehlen Installation, Tokenregistrierung und reale Geräte-/Mobilfunktests. Expo Enhanced Push Security samt `EXPO_ACCESS_TOKEN` bleibt eine optionale spätere Härtung. Details stehen in `docs/GENERAL_ALARM.md`.
- Das Notfallschema, das rollenbasierte Notfall-Dashboard, die Admin-Diensteinteilung sowie `dispatch-emergency-alert` und `dispatch-emergency-duty` sind remote bereitgestellt. Admins sehen alle Notfälle, medizinisches Personal nur medizinische Fälle und das Organisationsteam die übrigen Anfragen. Bei jeder neuen Notfallmeldung ist eine verständliche textliche Ortsangabe Pflicht; genaue Gerätekoordinaten bleiben freiwillig. Bei vorhandener Diensteinteilung werden nur die eingeteilten Personen adressiert; ohne Einteilung greift ein Fallback auf das gesamte zuständige Team. Vor produktiver Nutzung fehlen reale Push-Tests beider Zielwege auf iOS und Android. Details stehen in `docs/EMERGENCY_ALERTS.md`.
- Arabisch richtet Texte aus, schaltet aber die gesamte native Layoutreihenfolge noch nicht über `I18nManager` auf RTL um.
- Der vollständige npm-Audit meldete am 27. August 2026 keine Critical-, aber 4 High- und 11 Moderate-Einträge. Die High-Einträge hängen an der Expo-/Metro-Buildkette und deren `image-size`-Parsern; der vollständige Moderate-Fix würde Expo beziehungsweise `expo-splash-screen` inkompatibel herabstufen. Auf kompatible Expo-/Metro-Patches warten und keinen `npm audit fix --force` ausführen.
- Es fehlen weiterhin native Store-Builds und der reale Last-/Netzwerktest mit etwa 100 Geräten; der fertige iOS-Preview-Build und die vorhandenen Playwright-Smokes ersetzen keine signierten iOS-/Android-Gerätetests des gesamten Pushablaufs.

## Definition of Done

Eine Aufgabe ist erst abgeschlossen, wenn die gewünschte Funktion erreichbar ist, TypeScript und Lint bestanden haben oder konkrete Fehler dokumentiert sind, SDK-57-Kompatibilität erhalten bleibt, Backendtypen und Migrationen synchron sind, alle drei Sprachen berücksichtigt wurden, keine ungeprüften religiösen Aussagen hinzugefügt wurden und relevante Plattform-/Zustandsvarianten geprüft sind. Bei Architektur- oder Produktänderungen gehört eine Aktualisierung dieser Datei zum Abschluss.
