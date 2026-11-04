# Push beim Start einer Statusabfrage

Nach erfolgreichem Start einer Statusabfrage ruft der aktualisierte Client `dispatch-group-check` auf. Die Nachricht erscheint in der Gerätesprache (DE/EN/AR), verwendet den vorhandenen Standardton und Android-Kanal `general-alarm` und öffnet `/check-in`. Beim Kaltstart wartet die Navigation auf Anmeldung, Intro und Startprüfungen. Die frei eingegebene Frage wird erst innerhalb der App gezeigt und steht nicht im Push-Text.

Die neue Migration `20261104010000_notify_group_checks.sql` speichert über einen privaten Insert-Trigger atomar die zu diesem Zeitpunkt registrierten Geräte aller Kontorollen, einschließlich Admins. Es ist keine aktive Fahrt nötig. Bestehende Statusabfragen und später registrierte Geräte erhalten keinen nachträglichen Push.

Der Dispatcher prüft die Anmeldung und aktuelle Adminrolle. Die ausschließlich für `service_role` freigegebene Claim-RPC prüft die Rolle erneut pro Batch, sperrt die Abfrage gegen paralleles Schließen und beansprucht höchstens 100 Geräte. Geschlossene Abfragen, bereits beantwortende Konten sowie entfernte oder neu zugeordnete Geräte werden übersprungen. Bereits beanspruchte Versuche werden auch nach einem Timeout nicht erneut versendet; dadurch führen parallele Aufrufe und Wiederholen nicht zu doppelten Nachrichten. Eine Schließung nach dem Beanspruchen kann einen bereits laufenden Versand nicht zurückrufen.

Der bestehende Expo-Dispatcher verarbeitet Tickets und protokolliert ausschließlich strukturierte Fehler und Ticket-IDs. Tokens und Empfänger bleiben im privaten Backend. Eine Expo-Annahme bestätigt keine tatsächliche Anzeige oder Zustellung auf dem Gerät; Receipt-Abfragen sind nicht ergänzt.

Ein fehlgeschlagener Versand macht den erfolgreichen Start nicht rückgängig. Die Verwaltung zeigt an der weiterhin aktiven Abfrage einen übersetzten Hinweis mit „Push-Versand fortsetzen“. Dieser bearbeitet nur bislang unbeanspruchte Geräte. Fehlgeschlagene oder unbestätigte bereits beanspruchte Versuche werden nicht erneut gesendet; deren Hinweis bleibt bestehen. Der lokale Hinweis wird beim Schließen beziehungsweise Neustarten des Panels nicht wiederhergestellt. Der Versand wird durch den aktualisierten Client ausgelöst; ältere Clients oder ein Abbruch direkt nach dem Speichern benötigen einen späteren expliziten Dispatch, es gibt keinen neuen Scheduler.

## Bereitstellung

1. Die additive Migration `20261104010000_notify_group_checks.sql` auf dem Zielprojekt anwenden.
2. `dispatch-group-check` mit der vorhandenen Supabase-CLI bereitstellen. Die Function nutzt `verify_jwt = false` und prüft den Bearer-Token selbst.
3. Den aktualisierten Client ausliefern. Für diese Änderung werden keine neuen nativen Pakete, Konfigurationen oder Development Builds benötigt; ein installierter Release-/Preview-Client muss den neuen JavaScript-Stand erhalten.
4. Auf den Empfängergeräten Mitteilungen aktivieren und die App für die Tokenregistrierung einmal öffnen. Der bestehende serverseitige `EXPO_ACCESS_TOKEN` muss bei aktivierter Expo Push Security gültig sein.

In diesem Auftrag wurde kein Remote-Deployment und kein echter Push ausgelöst. Native Geräteanzeige bleibt zu prüfen.

## Gezielte Prüfung

56 Jest-Prüfungen in sechs unmittelbar betroffenen Suites bestehen: erfolgreicher Start, erhaltene Abfrage bei Versandfehlern, kein Versand nach Startfehler/Kontowechsel, Rollen-/Eingabeprüfung, vorhandene Expo-Ticketverarbeitung sowie Antippen und Kaltstartnavigation. Deno prüft die neue Function erfolgreich. Die neue SQL-Suite enthält 29 Assertions für Rechte, Empfänger, Sprachen, Schließung, bereits erfolgte Antworten, Gerätewechsel, Batchgrenzen und Idempotenz; sie wurde mangels laufendem Docker/Supabase nicht ausgeführt.

Web-Export und Lint bestehen mit den vier bekannten Warnungen. TypeScript meldet ausschließlich den bestehenden Rückgabetypkonflikt in `AdminBusManagementPanel.tsx:326`. Der lokale Expo-Abgleich besteht mit Offline-Hinweis; Expo Doctor konnte wegen gesperrtem npm-Netzwerkzugriff nicht starten. Manifest und Lockfile bleiben unverändert. Auf Nutzerwunsch keine vollständige Testsuite oder zusätzlichen Geräte-/E2E-Läufe.
