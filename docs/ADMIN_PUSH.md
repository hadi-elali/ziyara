# Push-Nachrichten an alle

Unter `/admin` öffnet „Push-Nachricht an alle“ ein Formular mit Titel (maximal 100 Zeichen) und Nachricht (maximal 500 Zeichen). „Nachricht prüfen“ speichert einen Entwurf und zeigt eine Vorschau. Erst „An alle senden“ startet den Versand. Die Nachricht bleibt organisatorischer Freitext und wird allen Empfängern in der eingegebenen Sprache geschickt. Deutsch, Englisch und Arabisch sind für die Bedienoberfläche vorhanden.

Beim ersten Versandaufruf erfasst die Datenbank alle aktuell registrierten Push-Geräte, einschließlich Admin- und Mitarbeitergeräten. Eine Fahrt oder Gruppenzuordnung ist nicht erforderlich. Ohne registriertes Gerät, bei deaktivierten Mitteilungen, im Web oder in Expo Go wird kein Push empfangen. Die vorhandene Geräteregistrierung und der Android-Kanal `general-alarm` mit Standardton werden weiterverwendet; der spezielle Weckrufton gehört weiterhin nur zum Weckruf. Ein Tipp öffnet die App über deren normalen Startablauf; es gibt kein zusätzliches Teilnehmerpostfach.

Der gesamte Block „Letzte 10 Nachrichten“ ist auf Nutzerwunsch entfernt. Der Client liest keinen Nachrichtenverlauf mehr und zeigt keine Versandzahlen oder Verlaufsaktionen. Entwürfe und private Versandprotokolle bleiben für die serverseitige Idempotenz gespeichert. Nach Schließen des Formulars oder App-Neustart gibt es keinen Zugriff auf frühere Nachrichten oder Entwürfe über die Oberfläche.

Nach einem Versandfehler bleibt die aktuelle Vorschau mit derselben Nachrichten-ID geöffnet. Ein erneutes Anstoßen verwendet diese ID. Die ausschließlich serverseitige Claim-RPC sperrt die Nachricht und beansprucht höchstens 100 Geräte pro Aufruf. Parallele oder wiederholte Aufrufe senden einen beanspruchten Versuch nicht erneut, auch nach Timeout oder unbekanntem Ergebnis. Nur bisher unbeanspruchte Versuche werden verarbeitet. Neu registrierte Geräte werden nach dem ersten Versand nicht ergänzt. Vor der Beanspruchung abgemeldete oder einem anderen Konto zugeordnete Geräte werden als fehlgeschlagen verbucht. Tokenlöschung erhält die historischen Geräteanzahlen; automatische Wiederholung fehlgeschlagener oder unbestätigter Versuche und automatische Expo-Receipt-Abfragen sind nicht implementiert.

Der Abschluss eines Versandlaufs bestätigt keine Zustellung an APNs/FCM oder Anzeige auf dem Gerät; er kann fehlgeschlagene Expo-Tickets enthalten. Die Oberfläche weist darauf hin. Die private Serverdiagnose bleibt bei Bedarf für den Betrieb verfügbar.

Die App darf weder Tokenlisten noch Empfängerkennungen oder private Versandprotokolle lesen. Authentifizierte Admin-RPCs erstellen Entwürfe und liefern ausschließlich Nachrichtentext und aggregierte Zahlen. `dispatch-admin-push` prüft den Bearer-Token über Supabase Auth und die aktuelle Adminrolle. Die Claim-RPC kontrolliert die Rolle zusätzlich bei jedem Batch. Clientseitige direkte Schreibrechte sind entzogen; strukturierte Diagnosecodes, HTTP-Status und Expo-Ticket-UUID liegen ausschließlich im privaten Serverprotokoll.

## Bereitstellung

Vor Nutzung des aktualisierten Clients müssen `20261024000000_add_admin_push_broadcasts.sql` und die neue Function `dispatch-admin-push` auf Supabase bereitgestellt werden. Diese Aufgabe hat keine Remote-Daten verändert und keinen echten Push versendet.

```bash
npx supabase db push --dry-run
# Ausstehende Migrationen prüfen; im Worktree gibt es weitere vorbereitete Änderungen.
npx supabase db push
npx supabase functions deploy dispatch-admin-push
```

`supabase/config.toml` deaktiviert ausschließlich den vorgeschalteten Legacy-JWT-Check. Die zwingende Prüfung innerhalb der Function bleibt aktiv. Sie benötigt die üblichen serverseitigen Supabase-Umgebungswerte und unterstützt das vorhandene Secret `EXPO_ACCESS_TOKEN` für Expo Push Security. Kein Service-Role-Key oder Expo-Access-Token gehört in den Client. Das Vorhandensein aktueller Remote-Secrets wurde für diese Änderung nicht geprüft.

Keine native Konfiguration oder Abhängigkeit wurde geändert. Für diese Erweiterung ist kein zusätzlicher nativer Development Build erforderlich; der aktualisierte JavaScript-Client muss ausgeliefert werden. Bestehende native Push-Voraussetzungen gelten weiterhin. Ein Test mit einem ausdrücklich freigegebenen Gerät und anschließend ein echter Rundversand stehen aus.

## Prüfung am 24. Oktober 2026

Nach Entfernung des Verlaufs bestehen die zehn angepassten Tests der bestehenden Adminpanel-Suite, TypeScript, Lint mit vier vorhandenen Warnungen, Web-Export und Diffprüfung. Der lokale Expo-Abgleich besteht mit Offline-Hinweis; Online-Doctor besteht nach Netzwerkfreigabe erneut 20/21 Checks mit denselben sieben bekannten SDK-57-Patchabweichungen. Keine weitere Backendprüfung für diese UI-Korrektur. Der ursprüngliche Prüfstand der unveränderten Versandimplementierung umfasst 30 fokussierte Jest-Tests für UI und Dispatcher sowie 34 Datenbankassertions. Die SQL-Datei `supabase/tests/database/admin_push_broadcasts.test.sql` wurde gegen die tatsächliche neue Migration in isoliertem PGlite-PostgreSQL mit historischen Profil-/Gerätedefinitionen ausgeführt; lokale Assertionfunktionen ersetzen dort die nicht verfügbare pgTAP-Erweiterung. Das temporäre Prüfskript liegt unter `/private/tmp/ziyara-age-sql-check/check-admin-push.cjs`. Kein vollständiger Supabase-/Parallelitäts-, E2E- oder Gerätelauf.

TypeScript, Lint (vier bestehende Warnungen), Web-Export und die Deno-Typprüfung der Function bestehen. Der lokale Expo-Paketabgleich besteht mit Offline-Hinweis. Online-Expo-Doctor besteht 20/21 Checks und meldet die sieben bereits bekannten SDK-57-Patchabweichungen. Paketmanifest, Lockfile und native Konfiguration bleiben unverändert.
