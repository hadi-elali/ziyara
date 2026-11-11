# Push bei Freigabe der Buswahl

Die Reiseleitung trägt zuerst alle Busse ein und gibt anschließend über „Busauswahl starten“ die Auswahl frei. Erst diese ausdrückliche Freigabe bereitet einmalig eine Push-Nachricht für alle zu diesem Zeitpunkt registrierten Geräte vor. Auch übernommene Busanordnungen warten auf diesen Schritt. Ohne mindestens einen Bus ist die Freigabe gesperrt. Weitere Busse, Zuordnungen und Anwesenheitsantworten erzeugen keinen weiteren Rundversand.

`trips.bus_selection_started_at` speichert die Freigabe dauerhaft. Bis dahin zeigt `/bus` einen Wartehinweis; die Startseite bietet noch keine Buswahl an. Die eigenen Auswahl- und Anwesenheits-RPCs weisen vorzeitige Aufrufe ebenfalls zurück. Admins können Busse und Zuordnungen bereits vorbereiten. Bei der Migration bleiben bestehende Fahrten mit Bussen freigegeben, ohne neue Push-Ereignisse oder Empfänger anzulegen.

Titel: „Wer ist in welchem Bus?“

Text: „Die Buswahl ist jetzt freigeschaltet. Bitte wähle deinen Bus und bestätige, ob du schon im Bus bist.“

Die Nachricht richtet sich nach der Gerätesprache (DE/EN/AR), verwendet den vorhandenen Standardton und Android-Kanal `general-alarm` und öffnet beim Antippen `/bus`, auch beim Kaltstart. Dafür wird die vorhandene Benachrichtigungsnavigation unverändert verwendet. Nutzer benötigen aktivierte Push-Mitteilungen und eine bestehende Geräteregistrierung.

## Bereitstellung

1. Nach den bestehenden Bus- und Pushmigrationen einschließlich `20261029020000_notify_bus_selection_available.sql` die neue Migration `20261110020000_start_bus_selection_explicitly.sql` auf Supabase anwenden. Sie verlegt den Snapshot vom ersten Bus auf die ausdrückliche Freigabe und ergänzt die Admin-Start-RPC.
2. `dispatch-bus-selection` mit dem vorhandenen Supabase-Projekt bereitstellen. `supabase/config.toml` setzt `verify_jwt = false`; die Function prüft den Bearer-Token über Auth und verlangt die Adminrolle. Sie verwendet das bestehende optionale `EXPO_ACCESS_TOKEN`.
3. Den aktualisierten Client ausliefern. Er startet den Versand nach erfolgreicher Freigabe. Alte Clients können neue Fahrten nicht freigeben; vorzeitige Dispatcher-/Auswahlaufrufe bereiten keinen Versand vor und erlauben keine Auswahl. Der bestehende Dispatcher muss für diese Änderung nicht angepasst werden. Neue Abhängigkeiten oder native Konfiguration sind nicht erforderlich.

Die neue Freigabe-Migration ist lokal vorbereitet und noch nicht remote angewandt. Die lokale PostgreSQL-Prüfung umfasst 66 pgTAP-Assertions und die Übernahme bestehender Busse ohne Push-Nachbefüllung; die gesamte Testtransaktion wurde zurückgerollt. Kein echter Push oder Gerätetest.

## Verhalten bei Fehlern

Die Datenbank speichert Freigabe, Ereignis und Gerätesnapshot in derselben Transaktion. Wiederholte Startaufrufe erhalten Zeitpunkt und Snapshot. Ein leerer Snapshot bleibt leer; spätere Registrierungen werden nicht nachträglich aufgenommen. Tokens, Geräte und Empfänger sind ausschließlich serverseitig zugänglich. Die Claim-RPC prüft die Adminrolle für jeden Batch, überspringt entfernte oder umgebundene Geräte und liefert höchstens 100 noch nicht beanspruchte Versuche. Vor Freigabe und nach Fahrtende werden keine neuen Versuche beansprucht.

Versandfehler erhalten die erfolgreiche Freigabe. Die Verwaltung zeigt für die betreffende aktive Fahrt einen Hinweis und „Push-Versand fortsetzen“. Dabei werden nur noch nicht beanspruchte Versuche bearbeitet. Bereits fehlgeschlagene oder unbestätigte beanspruchte Versuche werden zur Vermeidung doppelter Nachrichten nicht erneut gesendet; deren Hinweis bleibt bestehen. Der lokale Fehlerhinweis wird beim Schließen oder Neustarten des Panels nicht wiederhergestellt. Weitere Busanlagen rufen den Dispatcher nicht auf. Eine Expo-Annahme bestätigt keine tatsächliche Zustellung oder Anzeige auf dem Gerät.
