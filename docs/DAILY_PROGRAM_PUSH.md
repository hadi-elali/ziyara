# Push für einzelne Programmpunkte

Admins veröffentlichen zunächst das Tagesprogramm ohne Push-Einstellungen. Nach Öffnen des Programms auf Home besitzt jeder einzelne Unterpunkt eine Uhr ausschließlich für Admins. Die Uhr öffnet direkt unter diesem Punkt eine kompakte, abgesetzte Karte: Schalter, Datum und große Uhrzeit nebeneinander, lokale Zeitzone, kurzer Speichern-Knopf und Schließen-Symbol. Auf schmalen Ansichten können die Felder umbrechen. Geplante Termine stehen direkt am zugehörigen Punkt. Der Tageskopf enthält keine Push-Steuerung.

Bei neuen Einstellungen sind das aktuelle lokale Datum und die aktuelle Uhrzeit vorausgewählt. Die Vorgabe folgt der aktuellen Minute, bis der Admin Datum oder Uhrzeit manuell ändert. Bestehende gespeicherte Termine werden beim Bearbeiten exakt geladen. Schließen verwirft ungespeicherte Änderungen. Die Umrechnung berücksichtigt den Offset des ausgewählten Datums einschließlich Sommer-/Winterzeit. Nicht existente Zeiten bei der Frühjahrsumstellung sowie ungültige oder vergangene gewählte Termine werden abgewiesen. Bei der doppelten Herbststunde gilt für neue Eingaben das erste Vorkommen; bestehende unveränderte Zeitpunkte bleiben exakt erhalten.

Die aktuelle Minute ist als Versandzeit erlaubt. `p_send_now` lässt den Server seinen aktuellen Zeitpunkt speichern, damit Sekunden und Netzwerklaufzeit die aktuelle Minute nicht als Vergangenheit ablehnen. Der vorhandene Minutenscheduler verarbeitet diesen Termin beim nächsten Lauf, auch ohne geöffnete App. Dies ist keine Zusage sofortiger Geräteanzeige.

## Daten und Identität

- `daily_program_items` speichert jeden sichtbaren Unterpunkt mit fester ID, Programm-ID, Position, Text, `push_scheduled_at` und `push_started_at`. Gleiche Texte an verschiedenen Positionen haben unterschiedliche IDs und unabhängige Pushs.
- Die Migration überführt bestehende nicht leere Programmzeilen in diese Tabelle. Inhalte bleiben im bisherigen mehrzeiligen Erstellformular bearbeitbar. Ein Trigger synchronisiert die Unterpunkte atomar mit dem Programmtext. Unveränderte Zeilen behalten bei Einfügen und Umsortieren ihre IDs und Termine. Gleiche Texte werden nach bisheriger Vorkommensreihenfolge zugeordnet; eine Textliste kann das Löschen eines bestimmten gleichlautenden Vorkommens nicht ausdrücken. Entfernte oder umgeschriebene Zeilen verlieren ihren bisherigen Termin. Neue oder umgeschriebene Zeilen benötigen eine neue Push-Planung.
- `admin_schedule_daily_program_item_push` prüft Adminrolle und vorhandene Unterpunkt-ID. Sie ändert ausschließlich dessen Versandtermin. Die Inhalts-RPC ignoriert Push-Felder und erstellt keine Push-Aufträge. Direkte Client-Schreibrechte auf Unterpunkte bleiben gesperrt.
- Frühere Pushs für ganze Tage werden bei Anwendung der neuen Migration storniert. Sie werden keinem Unterpunkt zugeordnet. Die ältere Tages-RPC verliert das Client-Ausführungsrecht; ihre alten Tagesspalten bleiben für Schema-Kompatibilität erhalten.
- Der Client lädt Unterpunkte zusammen mit dem Tagesprogramm. Terminänderung und Aktivierung aktualisieren dessen `updated_at`, sodass die vorhandene Realtime-Subscription die Übersicht erneuert. Der benutzergebundene Offline-Cache speichert die Unterpunkte; ältere Snapshots ohne IDs zeigen weiterhin ihre Textzeilen, bis der Server neue Daten liefert. Erst persistente Unterpunkte erhalten eine Uhr.

## Versand

- Die privaten `daily_program_push_jobs` beziehen sich auf eine Unterpunkt-ID. Je Unterpunkt gibt es höchstens einen nicht stornierten Auftrag. Gleichbleibende Termine erzeugen keinen neuen Versand; ein neuer Termin ersetzt den bisherigen Auftrag. Abschalten oder Entfernen stoppt unbeanspruchte Batches.
- Alle normalen Inhaltsänderungen, Terminänderungen und Claims sperren zuerst die Programmzeile. Die nur für `service_role` erlaubte Claim-RPC erfasst die registrierten Geräte beim Versandstart und beansprucht höchstens 100 Geräte eines Unterpunkts je Aufruf. Entfernte oder umgebundene Geräte werden übersprungen. Bereits beanspruchte Versuche werden nicht automatisch wiederholt.
- `dispatch-general-alarm` ruft `_shared/daily-program-dispatch` unabhängig von Weckrufen auf. Titel und Text werden beim Start festgehalten. Der Text enthält ausschließlich den gewählten Unterpunkt und gegebenenfalls die Programmüberschrift, begrenzt auf 500 Zeichen. Titel folgen der Geräte-Locale DE/EN/AR. Payload: `programId`, `itemId`, `route: '/program'`.
- Verwendet werden die vorhandenen registrierten Geräte, `general-alarm`, Standardton und gegebenenfalls `EXPO_ACCESS_TOKEN`. Ein Push öffnet die Programmübersicht auch beim Kaltstart. `push_started_at` bestätigt keinen Empfang. Expo-Tickets und strukturierte Fehler bleiben im privaten Backendprotokoll. Receipt-Abfragen und eine Adminanzeige einzelner Versandfehler sind nicht implementiert.

## Bereitstellung

Vor Auslieferung des aktualisierten Clients:

1. Die drei Migrationen in Reihenfolge anwenden: `20261029010000_schedule_daily_program_push.sql`, `20261029170000_manage_daily_program_push.sql`, `20261029180000_schedule_daily_program_items.sql`. Weitere lokal ausstehende Migrationen unabhängig prüfen.
2. `dispatch-general-alarm` einschließlich `_shared/daily-program-dispatch` erneut bereitstellen. Die aktuelle Function erwartet die neue Unterpunkt-ID im Claim-Ergebnis; Migration und Function gemeinsam vor Clientauslieferung ausrollen.
3. Bestehenden Minuten-Cronjob und dessen `GENERAL_ALARM_CRON_SECRET` beibehalten. Bei Expo Push Security muss das serverseitige `EXPO_ACCESS_TOKEN` gültig sein.
4. Aktualisierten Client ausliefern. Keine neue Function, kein neuer Cronjob, keine neuen Secrets und keine zusätzlichen nativen Abhängigkeiten erforderlich.

In diesem Auftrag wurden keine Migrationen remote angewandt, keine Functions bereitgestellt und keine echten Pushs ausgelöst. Ein zusätzlicher Development Build ist aufgrund dieser Erweiterung nicht erforderlich.

## Prüfstand

73 gezielte Jest-Tests in zehn bestehenden Suites bestehen, einschließlich Unterpunkt-Uhren, unabhängiger gleichlautender Einträge, aktueller lokaler Vorgabe mit Minutenwechsel, manueller Zeitwahl, Wiederherstellung gespeicherter Termine, Rollen, Fehlern, Abschalten und Cache-Kompatibilität. 49 Unterpunkt-Push- und 23 bestehende Tagesprogramm-SQL-Assertions bestehen in isoliertem PGlite-PostgreSQL mit tatsächlichen Migrationen, pgTAP-äquivalenten Assertions und minimalen Auth-/Profil-/Fahrt-Fixtures. Geprüft sind zudem Backfill und Stornierung bisheriger Tagespushs. Der Deno-Typcheck und ein synthetischer Dispatcher-Durchlauf mit zwei Unterpunkten desselben Tages bestehen ohne Netzwerkversand. Web-Export und Lint bestehen; Lint meldet vier bestehende Warnungen. Der globale Typecheck bleibt durch den bestehenden `TripParticipant`-/Array-Konflikt in `AdminBusManagementPanel.tsx:326` blockiert. Der lokale Expo-Abgleich besteht mit Offline-Hinweis; der erneut online ausgeführte Expo Doctor besteht 20/21 Checks mit denselben sieben bekannten SDK-57-Patchabweichungen. Keine vollständigen Supabase-, Mehrverbindungs-, E2E- oder Geräteprüfungen.
