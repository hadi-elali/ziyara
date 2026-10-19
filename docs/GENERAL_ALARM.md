# Weckruf und getrenntes Boarding

Seit dem 8. Oktober 2026 ist **Weckruf** ein eigener Dashboard-Punkt neben **Gruppen & Gruppenleitung** und **Fahrten & Busse**. Die Leitung gibt eine Nachricht ein und wählt **Jetzt** oder **Planen**. Seit dem 14. Oktober richten sich Eingabe, Bearbeitung und Anzeige nach der **lokalen Zeit des Geräts** der sendenden beziehungsweise verwaltenden Person. Der für das gewählte Datum gültige Zeitzonenversatz wird berücksichtigt, einschließlich Sommer- und Winterzeit. Gespeichert wird weiterhin ein absoluter UTC-Zeitpunkt; bestehende Termine behalten ihren Auslösezeitpunkt. Nicht existierende Uhrzeiten bei der Zeitumstellung werden abgewiesen; bei einer doppelt vorkommenden Uhrzeit gilt das erste Vorkommen. Eine spätere Änderung der Gerätezeitzone verändert nur die Anzeige. Mehrere Termine sind möglich und erscheinen in einer Liste zum Bearbeiten oder Stornieren. Dafür sind weder eine Gruppe noch eine Buszuordnung oder Fahrt nötig. Reisende sehen den Weckruf auf Home und unter `/alarm` und bestätigen einmal mit **Ich bin wach**. Die Leitung sieht bestätigte/gesamte Konten und beendet aktive Weckrufe einzeln.

`wake_up_calls` und `wake_up_call_recipients` speichern Nachricht und Empfänger dauerhaft. `dispatch-wake-up-call` verifiziert einen Admin-Token für den sofortigen Versand. Für geplante Weckrufe führt der vorhandene minütliche `dispatch-general-alarm`-Scheduler nach seiner Autorisierungsprüfung denselben gemeinsamen Dispatcher aus – auch ohne aktives Boarding und ohne geöffnete App. Die Datenbank aktiviert nur fällige, nicht stornierte Weckrufe und beansprucht je Weckruf/Gerät genau einen Push-Versuch. Der Push verwendet Ton gemäß den Geräteeinstellungen und öffnet `/alarm`. Ein Versandfehler lässt die In-App-Nachricht bestehen und wird der Leitung angezeigt. Die Empfänger werden erst beim Auslösen festgehalten. Konten, die zwischen Planung und Termin registriert werden, erhalten den Weckruf ebenfalls. Bereits aktive Weckrufe werden neuen Konten nicht nachträglich zugeordnet. Es gibt keine Statusfolge, Abfahrtszeit oder regelmäßige Eskalation für den Weckruf.

Am 9. Oktober 2026 wurden beide Migrationen `20261008000000_independent_groups_and_wake_up_calls.sql` und `20261008010000_schedule_wake_up_calls.sql` remote bestätigt. `dispatch-wake-up-call` v2 und `dispatch-general-alarm` v4 sind aktiv; die heruntergeladenen Quellen einschließlich `_shared/wake-up-dispatch` stimmen mit dem Repository überein. Der Cronjob `dispatch-general-alarm-every-minute` ist aktiv und läuft jede Minute. Die letzten fünf Läufe waren erfolgreich; die HTTP-Antworten der letzten Stunde waren 60-mal 200 ohne Timeout, ohne überfällige unaktivierte Weckrufe. Es wurden keine Testalarme ausgelöst. Die Auslösung erfolgt beim ersten Serverlauf ab dem Termin, üblicherweise innerhalb einer Minute, nicht sekundengenau. Die vorhandene Push-Registrierung wird wiederverwendet; neue native Abhängigkeiten werden nicht benötigt.

Das bisherige Abfahrtsverfahren bleibt unter **Fahrten & Busse** als **Boarding** erhalten: `Gelesen` → `Ich bin unterwegs` → `Im Bus`, mit bestehenden Fünf-Minuten-Erinnerungen und manueller Eskalation. Es verwendet weiterhin die historischen `general_alarm*`-Backendnamen und `dispatch-general-alarm`; seine lokalen Push-Titel wurden auf „Boarding“ angepasst. Der vorhandene Scheduler wird nun von Boarding und Weckrufen gemeinsam genutzt. Die folgenden Angaben dokumentieren seine bisherige Einrichtung.

## Produktionsaktivierung

Code allein aktiviert keinen produktiven Push-Kanal. Vor Nutzung mit der Reisegruppe sind diese Schritte erforderlich:

1. Erledigt am 14. September 2026 für die damalige App-ID; am 11. Oktober erneut geprüft: Das EAS-Projekt `@hadi_ea/al-batoul` ist über `expo.extra.eas.projectId` verbunden. Für die aktuelle App-ID `de.albatoul.ziyara.app` sind ein APNs-Push-Key und ein FCM-V1-Service-Account hinterlegt. Die lokale `google-services.json` verwendet ebenfalls diese Android-ID und dasselbe Firebase-Projekt wie der FCM-V1-Service-Account.
2. Erledigt: Die Migrationen `20260827130000_add_bus_boarding_read_status.sql`, `20260827140000_add_general_alarm.sql` und `20260827150000_enforce_general_alarm_status_order.sql` sind auf dem verknüpften Supabase-Projekt angewandt. Die letzte Migration erzwingt die Teilnehmerfolge auch serverseitig; nur das Reiseteam darf Status administrativ korrigieren.
3. Erledigt am 14. September 2026: Die Edge Function `dispatch-general-alarm` ist remote aktiv.
4. Erledigt am 14. September 2026: `GENERAL_ALARM_CRON_SECRET` wurde neu gesetzt und zusätzlich geschützt im Supabase Vault für den Scheduler hinterlegt. Der vollständige Live-Check vom 11. Oktober bestätigt inzwischen aktive Expo Push Security im Besitzerkonto; das dafür erforderliche `EXPO_ACCESS_TOKEN` fehlt laut Projektinhaber noch. Siehe Diagnose unten.
5. Erledigt am 14. September 2026: Der Supabase-Cronjob `dispatch-general-alarm-every-minute` ruft den Dispatcher jede Minute authentifiziert auf. Mehrere kontrollierte Läufe antworteten mit HTTP 200. Der periodische Aufruf aus dem geöffneten Adminpanel bleibt nur ein betrieblicher Fallback.
6. Teilweise erledigt am 14. September 2026: Ein signierter iOS-Preview-Build wurde erfolgreich erstellt; der Android-Preview-Build ist bei EAS gestartet. Offen bleiben Installation, Push-Aktivierung und reale Tests mit App-Neustart, gesperrtem Gerät, Fokus/Lautlosmodus, schwachem Netz, Tokenwechsel und mehreren Teilnehmer-IDs pro Konto auf echten iOS-/Android-Geräten.

Die App speichert Expo-Push-Tokens in einer nicht clientlesbaren Tabelle. Registrierung und Abmeldung laufen über benutzergebundene RPCs. Der Dispatcher akzeptiert entweder einen serverseitig geprüften Admin-Access-Token oder das Scheduler-Secret; nur `service_role` darf fällige Versandfenster beanspruchen. Die Oberfläche bezeichnet ein erfolgreiches Expo-Ticket bewusst nur als Übergabe an den Expo-Dienst, nicht als Zustellnachweis.

Seit dem 9. Oktober gilt Push in der Oberfläche erst nach erfolgreicher Tokenregistrierung als aktiviert. Bei einem Registrierungsfehler bleibt die Aktivierung erneut möglich, auch wenn die Geräteberechtigung bereits erteilt wurde. Notfall-Push öffnet das rollenbezogene Postfach auch bei offener Pflichtabfrage; beim Kaltstart wartet die Navigation auf den geladenen Auth-Zustand und den Root-Navigator.

## Weckruf-Push-Diagnose vom 11. Oktober 2026

Der lesende Live-Check hat je ein registriertes Android- und iOS-Gerät bestätigt. Die vorhandenen Weckruf-Versuche wurden beide nicht vom Expo-Dienst angenommen (`accepted = false`). Der bisherige Dispatcher speicherte keine Fehlerursache und keine Ticket-ID; diese alten Versuche lassen sich damit nicht rückwirkend aufklären. Expo Push Security ist auf Projektebene aus, im Besitzerkonto `hadi_ea` aber an; der anfängliche reine Projektcheck war unvollständig. Das bloße Vorhandensein der EAS-Zugangsdaten bestätigt weder deren Gültigkeit bei Apple/Google noch die Zustellung auf einem Gerät.

Die additive Migration `20261011000000_add_wake_up_push_diagnostics.sql` ergänzt die private Tabelle `wake_up_notification_attempts` um `error_code`, `expo_http_status` und `expo_ticket_id`. Der gemeinsame Dispatcher speichert für zukünftige Versuche den strukturierten Expo-Ticket-/Requestfehler oder einen Transportfehler. Freie Expo-Fehlermeldungen und verschachtelte Details werden verworfen, weil sie Push-Tokens enthalten können. HTTP-Fehlerseiten, Timeouts, Netzwerkfehler, ungültige Antworten und fehlende Tickets bleiben unterscheidbar. Erfolgreiche Tickets werden als UUID für eine anschließende Receipt-Abfrage gespeichert. `accepted` bezeichnet weiterhin ausschließlich die Expo-Annahme. Ein fehlgeschlagener Versuch bleibt beansprucht und wird nicht automatisch erneut versendet.

Bereitstellungsreihenfolge: zuerst die Migration, danach **beide** Functions `dispatch-wake-up-call` und `dispatch-general-alarm`, da beide denselben Dispatcher bündeln. Nach ausdrücklicher Freigabe wurde am 11. Oktober `20261011000000_add_wake_up_push_diagnostics.sql` erfolgreich remote angewandt; der Dry Run hatte ausschließlich diese Migration ausgewiesen. Der Projektinhaber hat anschließend beide Functions bereitgestellt. Der lesende Live-Abgleich bestätigt `dispatch-wake-up-call` v3 und `dispatch-general-alarm` v5 als `ACTIVE`; alle heruntergeladenen Quellen einschließlich `_shared/wake-up-dispatch` stimmen mit dem lokalen Code überein. Ein alter Weckruf wird wegen der bestehenden Idempotenz nicht erneut geschickt. Keine neue APK oder TestFlight-Version ist für diese Serverdiagnose erforderlich.

Deployment-Befehl für beide Functions im Projektverzeichnis:

```bash
npx supabase functions deploy dispatch-wake-up-call dispatch-general-alarm --project-ref nqaptsodtvqtonkwuizl --use-api --no-verify-jwt --jobs 1
```

Die serverseitige Admin-/Scheduler-Autorisierung bleibt in beiden Functions erhalten; `--no-verify-jwt` entspricht der bestehenden Gateway-Konfiguration.

Der erste neue Diagnoseversuch nach diesem Deployment scheitert für Android und iOS mit `expo_http_status = 403` und `error_code = 'UNAUTHORIZED'`; kein Ticket wurde akzeptiert. Der vollständige lesende EAS-Check zeigt `App.pushSecurityEnabled: false`, aber `App.ownerAccount.pushSecurityEnabled: true` für `hadi_ea`. Der Projektinhaber bestätigt, dass in Supabase kein `EXPO_ACCESS_TOKEN` gesetzt ist. Die aktive Kontosicherheit verlangt einen gültigen Expo-Token; dessen Fehlen erklärt die aktuelle Request-Autorisierungssperre. Alle Push-Dispatcher unterstützen bereits den Bearer-Header aus diesem Secret. Keine Secret-Werte wurden durch den Agenten gelesen oder verändert.

Nächster Schritt durch den Projektinhaber: Im [Expo-Konto](https://docs.expo.dev/accounts/programmatic-access/) `hadi_ea` einen gültigen Access Token mit Zugriff auf das App-Projekt erstellen. In Supabase unter **Edge Functions → Secrets** als Key `EXPO_ACCESS_TOKEN` und als Value den reinen Token ohne `Bearer ` speichern; der Dispatcher ergänzt das Präfix selbst. Danach einen neuen Weckruf ausdrücklich auslösen und dessen Fehlercode beziehungsweise Ticket/Receipt prüfen. [Supabase-Secrets](https://supabase.com/docs/guides/functions/secrets) lassen sich unabhängig vom App-Build ändern; für einen neu gesetzten Wert ist kein Function-Deployment erforderlich. Bei späteren Push-Sicherheitschecks stets sowohl die Projekt- als auch die Kontoeinstellung prüfen.

Die Diagnose kann ausschließlich über einen privilegierten Server-/Management-Zugang gelesen werden; die App erhält keine zusätzlichen Tabellenrechte. Im Supabase SQL Editor oder über eine autorisierte `supabase db query --linked`-Abfrage:

```sql
select a.call_id, d.platform, a.accepted, a.error_code,
       a.expo_http_status, a.expo_ticket_id, a.completed_at
from public.wake_up_notification_attempts a
join public.push_notification_devices d on d.id = a.device_id
order by a.id desc
limit 20;
```

`InvalidCredentials` weist auf ungültige Push-Zugangsdaten hin; `DeviceNotRegistered` auf ein nicht mehr erreichbares Token; `PUSH_TOO_MANY_EXPERIENCE_IDS` auf verschiedene Expo-Projekte innerhalb eines Requests. `expo_http_…` bedeutet einen HTTP-Fehler ohne verwertbaren Expo-Code, `expo_timeout` beziehungsweise `expo_network_error` einen Transportfehler. `expo_invalid_response` und `expo_missing_ticket` kennzeichnen unvollständige Antworten. Historische Versuche behalten für diese neuen Felder `null`.

Bei `accepted = true` kann die gespeicherte Ticket-ID über Expos `getReceipts`-Endpoint geprüft werden. Ein Receipt bestätigt nur die Übergabe an APNs/FCM, keine sichtbare Gerätebenachrichtigung. Die automatische Receipt-Abfrage ist noch nicht implementiert. Format und Fehlerbedeutungen sind in der [Expo-Versanddokumentation](https://docs.expo.dev/push-notifications/sending-notifications/) beschrieben.

## Bewusste Plattformgrenzen

Die Funktion ist kein unstillbarer Wecker. Nutzer können Benachrichtigungen deaktivieren, das Gerät ausschalten oder die App beenden. iOS darf Lautlosmodus beziehungsweise Fokus ohne Apples besonderes Critical-Alerts-Entitlement nicht umgehen. Android beschränkt bildschirmfüllende Alarmoberflächen auf dafür vorgesehene App-Kategorien. Hintergrundausführung ist ebenfalls nicht minutengenau garantiert. Remote-Push benötigt einen nativen Build und funktioniert in Expo Go nicht. Die App erkennt Expo Go vor dem Laden von `expo-notifications`, deaktiviert dort die Benachrichtigungsintegration und zeigt den eingeschränkten Zustand an, statt auf Android den vom Paket vorgesehenen Fehler auszulösen. Lokale Benachrichtigungen unterstützt Expo Go grundsätzlich; diese App aktiviert sie dort bewusst nicht getrennt vom produktiven Generalalarm-Pushpfad.

Darum bleibt die serverseitige Liste fehlender Bestätigungen die maßgebliche operative Sicht. Die App behauptet an keiner Stelle, eine Person garantiert geweckt oder eine Push-Nachricht garantiert zugestellt zu haben.

- [Expo Push Notifications](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Background Tasks](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Apple Critical Alerts](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)
- [Android 14: Full-screen intent notifications](https://developer.android.com/about/versions/14/behavior-changes-14)
