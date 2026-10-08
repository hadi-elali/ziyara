# Weckruf und getrenntes Boarding

Seit dem 8. Oktober 2026 ist **Weckruf** ein eigener Dashboard-Punkt außerhalb der Reiseorganisation. Die Leitung gibt eine Nachricht ein und wählt **Jetzt** oder **Planen**. Geplante Weckrufe verwenden Datum und Uhrzeit in **Irak-Zeit (Bagdad)**, unabhängig von der Zeitzone des Geräts. Mehrere Termine sind möglich und erscheinen in einer Liste zum Bearbeiten oder Stornieren. Dafür sind weder eine Gruppe noch eine Buszuordnung oder Zwischenreise nötig. Reisende sehen den Weckruf auf Home und unter `/alarm` und bestätigen einmal mit **Ich bin wach**. Die Leitung sieht bestätigte/gesamte Konten und beendet aktive Weckrufe einzeln.

`wake_up_calls` und `wake_up_call_recipients` speichern Nachricht und Empfänger dauerhaft. `dispatch-wake-up-call` verifiziert einen Admin-Token für den sofortigen Versand. Für geplante Weckrufe führt der vorhandene minütliche `dispatch-general-alarm`-Scheduler nach seiner Autorisierungsprüfung denselben gemeinsamen Dispatcher aus – auch ohne aktives Boarding und ohne geöffnete App. Die Datenbank aktiviert nur fällige, nicht stornierte Weckrufe und beansprucht je Weckruf/Gerät genau einen Push-Versuch. Der Push verwendet Ton gemäß den Geräteeinstellungen und öffnet `/alarm`. Ein Versandfehler lässt die In-App-Nachricht bestehen und wird der Leitung angezeigt. Die Empfänger werden erst beim Auslösen festgehalten. Konten, die zwischen Planung und Termin registriert werden, erhalten den Weckruf ebenfalls. Bereits aktive Weckrufe werden neuen Konten nicht nachträglich zugeordnet. Es gibt keine Statusfolge, Abfahrtszeit oder regelmäßige Eskalation für den Weckruf.

Für den Livebetrieb sind die Migrationen `20261008000000_independent_groups_and_wake_up_calls.sql` und `20261008010000_schedule_wake_up_calls.sql` sowie die Functions `dispatch-wake-up-call` und `dispatch-general-alarm` bereitzustellen. Bisher sind beide Migrationen nur lokal angewandt. Der vorhandene Cronjob `dispatch-general-alarm-every-minute` muss aktiv sein. Die Auslösung erfolgt beim ersten Serverlauf ab dem Termin, üblicherweise innerhalb einer Minute, nicht sekundengenau. Die vorhandene Push-Registrierung wird wiederverwendet; neue native Abhängigkeiten werden nicht benötigt.

Das bisherige Abfahrtsverfahren bleibt unter **Zwischenreisen & Busse** als **Boarding** erhalten: `Gelesen` → `Ich bin unterwegs` → `Im Bus`, mit bestehenden Fünf-Minuten-Erinnerungen und manueller Eskalation. Es verwendet weiterhin die historischen `general_alarm*`-Backendnamen und `dispatch-general-alarm`; seine lokalen Push-Titel wurden auf „Boarding“ angepasst. Der vorhandene Scheduler wird nun von Boarding und Weckrufen gemeinsam genutzt. Die folgenden Angaben dokumentieren seine bisherige Einrichtung.

## Produktionsaktivierung

Code allein aktiviert keinen produktiven Push-Kanal. Vor Nutzung mit der Reisegruppe sind diese Schritte erforderlich:

1. Erledigt am 14. September 2026: Das EAS-Projekt `@hadi_ea/al-batoul` ist über `expo.extra.eas.projectId` verbunden. Für `de.albatoul.ziyara` sind ein APNs-Push-Key und ein FCM-V1-Service-Account hinterlegt.
2. Erledigt: Die Migrationen `20260827130000_add_bus_boarding_read_status.sql`, `20260827140000_add_general_alarm.sql` und `20260827150000_enforce_general_alarm_status_order.sql` sind auf dem verknüpften Supabase-Projekt angewandt. Die letzte Migration erzwingt die Teilnehmerfolge auch serverseitig; nur das Reiseteam darf Status administrativ korrigieren.
3. Erledigt am 14. September 2026: Die Edge Function `dispatch-general-alarm` ist remote aktiv.
4. Erledigt am 14. September 2026: `GENERAL_ALARM_CRON_SECRET` wurde neu gesetzt und zusätzlich geschützt im Supabase Vault für den Scheduler hinterlegt. Expo Enhanced Push Security ist derzeit nicht aktiviert; deshalb wird noch kein `EXPO_ACCESS_TOKEN` benötigt.
5. Erledigt am 14. September 2026: Der Supabase-Cronjob `dispatch-general-alarm-every-minute` ruft den Dispatcher jede Minute authentifiziert auf. Mehrere kontrollierte Läufe antworteten mit HTTP 200. Der periodische Aufruf aus dem geöffneten Adminpanel bleibt nur ein betrieblicher Fallback.
6. Teilweise erledigt am 14. September 2026: Ein signierter iOS-Preview-Build wurde erfolgreich erstellt; der Android-Preview-Build ist bei EAS gestartet. Offen bleiben Installation, Push-Aktivierung und reale Tests mit App-Neustart, gesperrtem Gerät, Fokus/Lautlosmodus, schwachem Netz, Tokenwechsel und mehreren Teilnehmer-IDs pro Konto auf echten iOS-/Android-Geräten.

Die App speichert Expo-Push-Tokens in einer nicht clientlesbaren Tabelle. Registrierung und Abmeldung laufen über benutzergebundene RPCs. Der Dispatcher akzeptiert entweder einen serverseitig geprüften Admin-Access-Token oder das Scheduler-Secret; nur `service_role` darf fällige Versandfenster beanspruchen. Die Oberfläche bezeichnet ein erfolgreiches Expo-Ticket bewusst nur als Übergabe an den Expo-Dienst, nicht als Zustellnachweis.

## Bewusste Plattformgrenzen

Die Funktion ist kein unstillbarer Wecker. Nutzer können Benachrichtigungen deaktivieren, das Gerät ausschalten oder die App beenden. iOS darf Lautlosmodus beziehungsweise Fokus ohne Apples besonderes Critical-Alerts-Entitlement nicht umgehen. Android beschränkt bildschirmfüllende Alarmoberflächen auf dafür vorgesehene App-Kategorien. Hintergrundausführung ist ebenfalls nicht minutengenau garantiert. Remote-Push benötigt einen nativen Build und funktioniert in Expo Go nicht. Die App erkennt Expo Go vor dem Laden von `expo-notifications`, deaktiviert dort die Benachrichtigungsintegration und zeigt den eingeschränkten Zustand an, statt auf Android den vom Paket vorgesehenen Fehler auszulösen. Lokale Benachrichtigungen unterstützt Expo Go grundsätzlich; diese App aktiviert sie dort bewusst nicht getrennt vom produktiven Generalalarm-Pushpfad.

Darum bleibt die serverseitige Liste fehlender Bestätigungen die maßgebliche operative Sicht. Die App behauptet an keiner Stelle, eine Person garantiert geweckt oder eine Push-Nachricht garantiert zugestellt zu haben.

- [Expo Push Notifications](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Background Tasks](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Apple Critical Alerts](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)
- [Android 14: Full-screen intent notifications](https://developer.android.com/about/versions/14/behavior-changes-14)
