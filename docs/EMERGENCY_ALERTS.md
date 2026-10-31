# Notfallmeldungen

Die geschützte Route `/emergency` speichert eine Hilfeanfrage zuerst dauerhaft und stößt danach Push an. Der Absender wählt `medical` oder `travel` und muss seinen Aufenthaltsort als verständlichen Text angeben. Nach ausdrücklicher Vordergrundfreigabe kann zusätzlich freiwillig eine einzelne Geräteposition gespeichert werden; es gibt kein Live- oder Hintergrundtracking. Jede Meldung wird für alle zum Absendezeitpunkt vorhandenen Konten der passenden Teamrolle sowie für alle Admins materialisiert: `medical_staff` erhält medizinische Notfälle, `organization_team` erhält organisatorische Notfälle und `admin` erhält beide Arten. Eine gesonderte Diensteinteilung gibt es nicht; alle Teammitglieder und Admins sind automatisch und dauerhaft im Dienst.

Das rollenbasierte `/emergency-dashboard` ist über die Einstellungen erreichbar:

- Admins sehen alle Notfallmeldungen.
- `medical_staff` sieht ausschließlich medizinische Notfälle.
- `organization_team` sieht die sonstigen Hilfeanfragen an das Organisationsteam.
- Teammitglieder sehen ihre Bereitschaft als dauerhaft aktiv. Im Adminbereich existiert keine manuelle Diensteinteilung.

Die Sichtbereiche werden durch Datenbank-RPCs und RLS geschützt; die UI-Anzeige allein ist keine Berechtigungsgrenze. Die Empfänger werden aus der aktuellen Team- oder Adminrolle bestimmt. Historische Einteilungsdaten beeinflussen neue Notfälle nicht mehr, und die frühere Einteilungs-RPC wird durch die neue Migration entfernt.

Medizinisches Personal, Mitglieder des Organisationsteams und Admins sehen auf Home einen hervorgehobenen Hinweis, sobald ihr persönliches Notfall-Postfach mindestens eine ungelesene, offene Meldung enthält. Admins erhalten Hinweise für beide Notfallarten. Der Hinweis öffnet `/emergency`, wo die Meldung gelesen und als gelesen markiert werden kann. Realtime, App-Rückkehr und ein gestaffelter Fallback-Refresh halten den Hinweis aktuell.

Seit dem 19. Oktober 2026 bieten `/emergency` und `/emergency-dashboard` zusätzlich „Als abgeschlossen markieren“: medizinisches Personal für medizinische Fälle, das Organisationsteam für organisatorische Fälle und Admins für beide Arten. Der gemeinsame Abschlussstatus und Zeitpunkt sind auch für Absender sichtbar. Persönliche Lesebestätigungen bleiben unabhängig; abgeschlossene Meldungen lösen keinen Hinweis auf neue Notfälle aus. Die Lese-RPCs zeigen offene Fälle zuerst und behalten abgeschlossene Fälle in der Historie.

Nur Admins sehen „Notfall löschen“. Ein nativer beziehungsweise Browserdialog verlangt eine ausdrückliche Bestätigung. Das Löschen entfernt die Meldung für Absender und alle Empfänger endgültig, einschließlich der zugehörigen Empfänger- und privaten Push-Protokollzeilen. Bereits ausgelieferte Systembenachrichtigungen werden dadurch nicht zurückgerufen. Beide Verwaltungsaktionen prüfen aktuelle Profilrollen und Zielteam serverseitig; direkte Tabellenschreibrechte bleiben entzogen.

Die zugehörige Migration `20261019000000_manage_emergency_requests.sql` ist lokal angewandt und geprüft, remote noch ausstehend. Sie muss vor Auslieferung des aktualisierten Clients remote angewandt werden. Der Dispatcher und die native Konfiguration benötigen hierfür keine Änderung oder neuen Development Build. Gezielte Prüfung: 47 SQL-Assertions in `emergency_management.test.sql` und `emergency_always_on_duty.test.sql`, 20 UI-/Home-Hinweis-Prüfungen; keine vollständige E2E- oder Gerätesuite.

## Einzelne Absender bei Missbrauch sperren

Admins öffnen „Notfall-Sperre verwalten“ direkt an einer eingegangenen Meldung in `/emergency` oder `/emergency-dashboard`. Alternativ ist die Verwaltung in `/admin` unter Benutzerübersicht → Person → Benutzerdetails verfügbar. Eine Sperre gilt für medizinische und organisatorische Notfallmeldungen desselben Kontos.

1. 1 Stunde, 24 Stunden oder „Bis zur manuellen Freigabe“ wählen.
2. Eine Begründung mit 5–500 Zeichen eingeben. Diese ist ausschließlich für Admins sichtbar.
3. „Notfallmeldungen sperren“ drücken. Erst die bestätigte Serverantwort gilt als gespeichert.
4. Ablauf beziehungsweise manuelle Freigabe, Begründung und verantwortlichen Admin prüfen. „Sperre jetzt aufheben“ gibt das Senden sofort wieder frei. Die Zeitsperren enden automatisch; „Bis zur manuellen Freigabe“ bleibt auch nach Neustarts aktiv, bis ein Admin sie ausdrücklich aufhebt.

Andere App-Funktionen und der Empfang beziehungsweise die Bearbeitung eingehender Notfälle bleiben verfügbar. Betroffene sehen auf der Notfallseite den Ablauf oder „Deine Notfallfunktion ist bis zur Freigabe durch einen Admin gesperrt“ sowie den Hinweis, sich bei Hilfebedarf direkt an das Organisations- oder medizinische Team zu wenden. Ist die Sperre erst während der Eingabe gesetzt worden, erhält die App den Entwurf und zeigt ausdrücklich „Es wurde kein Notfall gesendet“. Ein fehlgeschlagener Statusabruf verhindert keine Hilfeanfrage; die Datenbank kontrolliert jeden Sendeversuch.

`20261030000000_restrict_emergency_senders.sql` enthält die geschützte Historie, ausschließlich für Admins erlaubte Verwaltungs-RPCs und einen privaten Inserttrigger auf `emergency_requests`. Dieser greift auch für die bisherige Sende-RPC, ältere Clients und privilegierte direkte Inserts. Abgewiesene Versuche erzeugen keine Meldung und keine Empfänger; der aktualisierte Client ruft keinen Dispatcher auf. Die historische Sende-RPC behält ihre Signatur; ältere Clients erhalten einen Fehler und können ihn gegebenenfalls nur technisch anzeigen. Sperren, Senden und Aufheben verwenden dieselbe Profilzeilensperre; ein Widerruf muss die konkrete Sperr-ID nennen. Zeitablauf benötigt keinen Scheduler. Die Historie speichert Begründung sowie Admin/Zeitpunkt für Sperre und Aufhebung; Adminnamen bleiben nach deren Kontolöschung erhalten. Die Löschung des gesperrten Kontos entfernt dessen Sperrdaten.

Bereits gespeicherte Meldungen und bereits ausgelieferte Pushs werden durch die Sperre nicht zurückgerufen. Eine missbräuchliche Meldung kann zusätzlich gelöscht werden; ihre Löschung hebt die Sperre des Kontos nicht auf. Aktive Sperren werden nicht durch erneutes Setzen überschrieben. Wer eine andere Dauer benötigt, hebt die bestehende Sperre auf und setzt eine neue mit Begründung.

Die Folgemigration `20261030010000_allow_indefinite_emergency_restrictions.sql` erlaubt bei derselben Admin-RPC eine explizite `null`-Dauer für manuelle Freigabe. `restricted_until = 'infinity'` bleibt serverseitig aktiv, bis die protokollierte Admin-Aufhebung erfolgt. Bestehende Zeitsperren bleiben erhalten. Die eigenen Statusantworten und Fehlerdetails geben `infinity` als Zeichenfolge zurück; `null` als Status bedeutet weiterhin keine aktive Sperre. Der aktualisierte Client zeigt dafür den Freigabehinweis und plant keinen Ablauftimer.

Beide Migrationen sind lokal vorbereitet und mit 73 Sperren- und 47 bestehenden Assertions in isoliertem PGlite-PostgreSQL mit tatsächlichen Notfallmigrationen und pgTAP-äquivalenten Assertions geprüft. Sie sind weder in einer laufenden lokalen Supabase-Instanz noch remote angewandt. Beide in Reihenfolge vor dem aktualisierten Client produktiv anwenden. Kein Function-Deployment und kein neuer Development Build allein für diese Änderung erforderlich. Reale Geräte-, vollständige Supabase- und Mehrverbindungsprüfungen stehen aus.

## Produktiv bereitstellen

1. Erledigt am 14. September 2026: Die Basismigrationen `20260903000000_add_emergency_requests.sql`, `20260904000000_add_emergency_dashboard_and_duty.sql` und `20260904010000_require_emergency_location_label.sql` sind remote angewandt.
2. Erledigt und am 22. September 2026 per lokaler/Remote-Migrationsliste sowie leerem Dry Run bestätigt: `20260921000000_make_emergency_teams_always_on_duty.sql` ist remote angewandt. Sie adressiert immer das vollständige passende Team sowie alle Admins und entfernt die frühere Einteilungs-RPC.
3. `dispatch-emergency-alert` bleibt der einzige vom aktuellen Client aufgerufene Notfall-Dispatcher. Die remote noch vorhandene Legacy-Function `dispatch-emergency-duty` wird nicht mehr aufgerufen und erzeugt keine neuen Einteilungsnachrichten.
4. Erledigt am 14. September 2026: Das EAS-Projekt ist verbunden; APNs und FCM V1 sind für `de.albatoul.ziyara` hinterlegt. Expo Enhanced Push Security ist derzeit nicht aktiviert.
5. Teilweise erledigt am 14. September 2026: Der signierte iOS-Preview-Build ist fertig; der Android-Preview-Build ist gestartet. Der iOS-Berechtigungstext und der Android-Benachrichtigungskanal sind Bestandteil dieser nativen Builds.
6. Mit mindestens zwei Konten derselben Teamrolle sowie je einem Konto für `medical_staff` und `organization_team` Push aktivieren und prüfen, dass beide Mitglieder desselben Zielteams dieselbe Meldung erhalten.

Die eigentliche Bereitstellung erfolgt aus dem verknüpften Projekt mit:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase functions deploy dispatch-emergency-alert --no-verify-jwt
```

Push ist bestmöglich: Expo-Ticket-Annahme bedeutet nicht garantierte Anzeige oder Gerätezustellung. Bei fehlender Berechtigung, ausgeschaltetem Gerät, Fokus-/Lautlosmodus, Expo Go, Web oder einem Dispatcherfehler bleibt die Meldung weiterhin im geschützten Postfach abrufbar. Anliegen und genaue Koordinaten werden nicht im Pushtext angezeigt.
