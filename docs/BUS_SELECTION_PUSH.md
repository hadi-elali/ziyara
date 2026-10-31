# Push bei Freigabe der Buswahl

Sobald eine aktive Fahrt ihren ersten Bus erhält, wird einmalig eine Push-Nachricht für alle zu diesem Zeitpunkt registrierten Geräte vorbereitet. Das gilt auch beim Übernehmen einer gespeicherten Fahrt mit Bussen. Eine leere Fahrt löst noch keine Benachrichtigung aus. Weitere Busse, Zuordnungen und Anwesenheitsantworten erzeugen keinen weiteren Rundversand. Bereits bestehende Fahrten mit Bussen werden nicht nachträglich benachrichtigt.

Titel: „Wer ist in welchem Bus?“

Text: „Die Buswahl ist jetzt freigeschaltet. Bitte wähle deinen Bus und bestätige, ob du schon im Bus bist.“

Die Nachricht richtet sich nach der Gerätesprache (DE/EN/AR), verwendet den vorhandenen Standardton und Android-Kanal `general-alarm` und öffnet beim Antippen `/bus`, auch beim Kaltstart. Dafür wird die vorhandene Benachrichtigungsnavigation unverändert verwendet. Nutzer benötigen aktivierte Push-Mitteilungen und eine bestehende Geräteregistrierung.

## Bereitstellung

1. Nach den bestehenden Bus- und Pushmigrationen `20261029020000_notify_bus_selection_available.sql` auf Supabase anwenden.
2. `dispatch-bus-selection` mit dem vorhandenen Supabase-Projekt bereitstellen. `supabase/config.toml` setzt `verify_jwt = false`; die Function prüft den Bearer-Token über Auth und verlangt die Adminrolle. Sie verwendet das bestehende optionale `EXPO_ACCESS_TOKEN`.
3. Den aktualisierten Client ausliefern. Er startet den Versand nach erfolgreichem Anlegen eines Busses oder Kopieren einer Fahrt. Ältere Clients bereiten über den Datenbanktrigger ebenfalls den Snapshot vor, starten aber keinen Versand. Neue Abhängigkeiten oder native Konfiguration sind nicht erforderlich.

Migration und Function sind lokal vorbereitet und noch nicht bereitgestellt. Auf ausdrücklichen Nutzerwunsch wurden keine Tests oder sonstigen Prüfprogramme ausgeführt und kein Probe-Push verschickt.

## Verhalten bei Fehlern

Die Datenbank speichert Ereignis und Gerätesnapshot innerhalb der Bus-Transaktion. Ein leerer Snapshot bleibt leer; spätere Registrierungen werden nicht nachträglich aufgenommen. Tokens, Geräte und Empfänger sind ausschließlich serverseitig zugänglich. Die Claim-RPC prüft die Adminrolle für jeden Batch, überspringt entfernte oder umgebundene Geräte und liefert höchstens 100 noch nicht beanspruchte Versuche. Nach Fahrtende werden keine neuen Versuche beansprucht.

Versandfehler ändern eine erfolgreich angelegte Fahrt oder einen Bus nicht. Die Verwaltung zeigt für die betreffende aktive Fahrt einen Hinweis und „Push-Versand fortsetzen“. Dabei werden nur noch nicht beanspruchte Versuche bearbeitet. Bereits fehlgeschlagene oder unbestätigte beanspruchte Versuche werden zur Vermeidung doppelter Nachrichten nicht erneut gesendet; deren Hinweis bleibt bestehen. Der lokale Fehlerhinweis wird beim Schließen oder Neustarten des Panels nicht wiederhergestellt. Weitere Busanlagen können den bestehenden Versand fortsetzen, ohne bereits beanspruchte Geräte erneut zu benachrichtigen. Eine Expo-Annahme bestätigt keine tatsächliche Zustellung oder Anzeige auf dem Gerät.
