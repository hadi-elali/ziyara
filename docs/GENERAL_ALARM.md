# Generalalarm: Bedienung, Betrieb und Grenzen

Der Generalalarm ist im Adminbereich ein eigener, vom Busmanagement getrennter Punkt. Das Busmanagement dient nur dazu, Reise, Busse und Teilnehmer-IDs vorzubereiten. Danach öffnet der Admin **Generalalarm**, legt Meldung und eine Abfahrtszeit zwischen 1 und 1440 Minuten fest und schaltet den Alarm ausdrücklich ein. 15, 30 und 60 Minuten stehen als Schnellauswahl bereit; eine andere ganze Minutenanzahl kann direkt eingegeben werden. Ein eingeschalteter Generalalarm führt die Teilnehmer durch die feste Folge:

1. `Gelesen`
2. `Ich bin unterwegs`
3. `Im Bus`

Solange die nächste Stufe fehlt, wird sie alle fünf Minuten erneut fällig. Die Teilnehmer-App plant nach dem Empfang des aktiven Alarms lokale Erinnerungen. Der serverseitige Dispatcher beansprucht zusätzlich pro Gerät, Teilnehmer-ID, Stufe und Fünf-Minuten-Fenster höchstens einen Push-Versuch. Kurz vor der Abfahrt wechselt die App in eine dringliche Darstellung. Im eigenen Generalalarm-Punkt sieht das Reiseteam ausstehende physische Teilnehmer-IDs, Summen und den Schließstatus jedes Busses, kann Fälle manuell eskalieren und den Alarm ausdrücklich beenden.

## Produktionsaktivierung

Code allein aktiviert keinen produktiven Push-Kanal. Vor Nutzung mit der Reisegruppe sind diese Schritte erforderlich:

1. Ein echtes EAS-Projekt mit `expo.extra.eas.projectId` verbinden und die iOS-/Android-Push-Credentials einrichten.
2. Erledigt am 28. August 2026: Die Migrationen `20260827130000_add_bus_boarding_read_status.sql`, `20260827140000_add_general_alarm.sql` und `20260827150000_enforce_general_alarm_status_order.sql` sind auf dem verknüpften Supabase-Projekt angewandt. Die letzte Migration erzwingt die Teilnehmerfolge auch serverseitig; nur das Reiseteam darf Status administrativ korrigieren.
3. Die Edge Function `dispatch-general-alarm` deployen.
4. Das Function-Secret `GENERAL_ALARM_CRON_SECRET` setzen. Falls im Expo-Projekt Push-Zugriffsschutz aktiviert ist, zusätzlich `EXPO_ACCESS_TOKEN` setzen.
5. In Supabase Cron beziehungsweise einem gleichwertigen Scheduler jede Minute einen authentifizierten `POST` an `dispatch-general-alarm` auslösen und `x-general-alarm-cron-secret` mitsenden. Der periodische Aufruf aus dem geöffneten Adminpanel ist nur ein betrieblicher Fallback und ersetzt keinen Server-Scheduler.
6. Einen neuen nativen Development-/Produktionsbuild verteilen und Push, App-Neustart, gesperrtes Gerät, Fokus/Lautlosmodus, schwaches Netz, Tokenwechsel und mehrere Teilnehmer-IDs pro Konto auf echten iOS-/Android-Geräten testen.

Die App speichert Expo-Push-Tokens in einer nicht clientlesbaren Tabelle. Registrierung und Abmeldung laufen über benutzergebundene RPCs. Der Dispatcher akzeptiert entweder einen serverseitig geprüften Admin-Access-Token oder das Scheduler-Secret; nur `service_role` darf fällige Versandfenster beanspruchen. Die Oberfläche bezeichnet ein erfolgreiches Expo-Ticket bewusst nur als Übergabe an den Expo-Dienst, nicht als Zustellnachweis.

## Bewusste Plattformgrenzen

Die Funktion ist kein unstillbarer Wecker. Nutzer können Benachrichtigungen deaktivieren, das Gerät ausschalten oder die App beenden. iOS darf Lautlosmodus beziehungsweise Fokus ohne Apples besonderes Critical-Alerts-Entitlement nicht umgehen. Android beschränkt bildschirmfüllende Alarmoberflächen auf dafür vorgesehene App-Kategorien. Hintergrundausführung ist ebenfalls nicht minutengenau garantiert. Remote-Push benötigt einen nativen Build und funktioniert in Expo Go nicht. Die App erkennt Expo Go vor dem Laden von `expo-notifications`, deaktiviert dort die Benachrichtigungsintegration und zeigt den eingeschränkten Zustand an, statt auf Android den vom Paket vorgesehenen Fehler auszulösen. Lokale Benachrichtigungen unterstützt Expo Go grundsätzlich; diese App aktiviert sie dort bewusst nicht getrennt vom produktiven Generalalarm-Pushpfad.

Darum bleibt die serverseitige Liste fehlender Bestätigungen die maßgebliche operative Sicht. Die App behauptet an keiner Stelle, eine Person garantiert geweckt oder eine Push-Nachricht garantiert zugestellt zu haben.

- [Expo Push Notifications](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Background Tasks](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Apple Critical Alerts](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)
- [Android 14: Full-screen intent notifications](https://developer.android.com/about/versions/14/behavior-changes-14)
