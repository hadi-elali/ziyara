# Push bei Gruppen-Standortanfragen

Nach einer erfolgreich gespeicherten Standortanfrage ruft der aktualisierte Client `dispatch-group-location` mit der neuen Anfrage-ID auf. Ausschließlich die angefragte Gruppenleitung erhält eine Push auf ihren bereits registrierten Geräten. Andere Gruppenleiter, einfache Mitglieder, andere Admins und Außenstehende erhalten diese Nachricht nicht. Push-Mitteilungen müssen auf dem Zielgerät aktiviert sein.

Titel: „Standort angefragt“

Text: „Das Reiseteam bittet dich, deinen Standort einmalig zu teilen. Öffne deine Gruppe, um zuzustimmen oder abzulehnen.“

Die Nachricht verwendet DE/EN/AR gemäß Geräte-Locale, Standardton und den bestehenden Android-Kanal `general-alarm`. Antippen öffnet die geschützte Gruppenseite `/group`, auch nach einem Kaltstart und gegebenenfalls Anmeldung. Push löst keine Standortabfrage aus: Nur ausdrückliche Zustimmung in der App gibt einmalige Vordergrundkoordinaten frei. Ablehnung und die bestehende 15-Minuten-Sichtbarkeit bleiben erhalten.

## Bereitstellung

1. Nach den vorhandenen Gruppen- und Pushmigrationen die additive Migration `20261029190000_notify_group_location_requests.sql` auf Supabase anwenden.
2. Die neue Function `dispatch-group-location` bereitstellen. `supabase/config.toml` enthält `verify_jwt = false`; die Function prüft Bearer-Token und Adminrolle selbst. Sie nutzt das bestehende serverseitige `EXPO_ACCESS_TOKEN`, falls die Expo-Push-Sicherheit es verlangt. Die Claim-RPC ist ausschließlich für `service_role` ausführbar und prüft die Adminrolle zusätzlich je Batch.
3. Den aktualisierten Client ausliefern. Keine neuen Abhängigkeiten, nativen Konfigurationsänderungen oder zusätzlichen Development Builds erforderlich.

Migration und Function sind lokal vorbereitet und wurden in diesem Auftrag nicht remote angewandt oder bereitgestellt. Kein Probe-Push wurde verschickt. Ältere Clients starten den neuen Versandaufruf nicht. Es wird kein neuer Scheduler eingerichtet.

## Versand und Fehler

Ein privater Insert-Trigger speichert innerhalb der Anfrage-Transaktion einen Snapshot der zu diesem Zeitpunkt registrierten Geräte der angefragten Person. Bestehende Anfragen werden nicht nachträglich benachrichtigt; ein leerer Snapshot wird nicht aufgefüllt. Die Versandtabelle enthält keine Tokens oder Koordinaten. Tokens werden ausschließlich serverseitig als Expo-Versandziel verwendet. Das Datenobjekt der Benachrichtigung enthält nur `kind: 'group_location_requested'`, `requestId` und `route: '/group'`.

Die Claim-RPC verwendet dieselbe Transaktionssperre wie Anfrage, Antwort und Gruppenänderung. Sie überspringt ersetzte, gelöschte und bereits beantwortete Anfragen sowie entfernte oder vor dem Claim umgebundene Geräte. Sie beansprucht maximal 100 Geräte je Batch einmalig. Eine erneute ausdrückliche Standortanfrage erhält eine neue ID und darf erneut benachrichtigen. Gruppenänderungen und Löschung entfernen betroffene Anfragen und deren Versandversuche. Ein bereits beanspruchter Versand kann noch eintreffen, wenn die Anfrage während des Netzwerkanrufs beantwortet oder gelöscht wird; die Gruppenseite zeigt den aktuellen Serverstand.

Push-Fehler setzen die erfolgreiche Standortanfrage nicht zurück und lösen keine automatische neue Anfrage aus. Die Verwaltung zeigt einen übersetzten Hinweis; bei Bedarf kann sie ausdrücklich erneut anfragen. Bereits beanspruchte, fehlgeschlagene oder ungeklärte Versuche werden bei wiederholtem Function-Aufruf nicht erneut versendet. Expo-Annahme bestätigt keine tatsächliche Zustellung oder Anzeige auf dem Gerät. Der lokale Fehlerhinweis wird nach einem Panelneustart nicht wiederhergestellt.

## Prüfung

- 57 gezielte Jest-Tests in acht Suites für Anfrage/Push-Fehler, Benachrichtigungsantworten, Kaltstart, bestehende Gruppenlogik, Expo-Versand sowie Auth-/Routenregeln bestehen.
- 33 neue SQL-Assertions und 20 bestehende Gruppen-/Weckruf-Assertions bestehen in isoliertem PGlite-PostgreSQL mit tatsächlichen Gruppen-/Pushmigrationen und pgTAP-äquivalenten Assertions. Historische Anfragen werden zusätzlich auf fehlenden Push-Backfill geprüft. Kein vollständiger lokaler Supabase-, Parallelitäts- oder Gerätelauf.
- Web-Export, Deno-Typprüfung, lokaler Expo-Abgleich mit Offline-Hinweis und Diffprüfung bestehen. Lint ohne Fehler mit vier bestehenden Warnungen. Die globale Typprüfung meldet ausschließlich den bereits dokumentierten `TripParticipant`-/`TripParticipant[]`-Fehler in `AdminBusManagementPanel.tsx:326`. Online-Expo-Doctor: 20/21 Checks; dieselben sieben bestehenden SDK-57-Patchabweichungen. Paketmanifest und Lockfile unverändert.
