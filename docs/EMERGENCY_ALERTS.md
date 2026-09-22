# Notfallmeldungen

Die geschützte Route `/emergency` speichert eine Hilfeanfrage zuerst dauerhaft und stößt danach Push an. Der Absender wählt `medical` oder `travel` und muss seinen Aufenthaltsort als verständlichen Text angeben. Nach ausdrücklicher Vordergrundfreigabe kann zusätzlich freiwillig eine einzelne Geräteposition gespeichert werden; es gibt kein Live- oder Hintergrundtracking. Jede Meldung wird für alle zum Absendezeitpunkt vorhandenen Konten der passenden Teamrolle sowie für alle Admins materialisiert: `medical_staff` erhält medizinische Notfälle, `organization_team` erhält organisatorische Notfälle und `admin` erhält beide Arten. Eine gesonderte Diensteinteilung gibt es nicht; alle Teammitglieder und Admins sind automatisch und dauerhaft im Dienst.

Das rollenbasierte `/emergency-dashboard` ist über die Einstellungen erreichbar:

- Admins sehen alle Notfallmeldungen.
- `medical_staff` sieht ausschließlich medizinische Notfälle.
- `organization_team` sieht die sonstigen Hilfeanfragen an das Organisationsteam.
- Teammitglieder sehen ihre Bereitschaft als dauerhaft aktiv. Im Adminbereich existiert keine manuelle Diensteinteilung.

Die Sichtbereiche werden durch Datenbank-RPCs und RLS geschützt; die UI-Anzeige allein ist keine Berechtigungsgrenze. Die Empfänger werden aus der aktuellen Team- oder Adminrolle bestimmt. Historische Einteilungsdaten beeinflussen neue Notfälle nicht mehr, und die frühere Einteilungs-RPC wird durch die neue Migration entfernt.

Medizinisches Personal, Mitglieder des Organisationsteams und Admins sehen auf Home einen hervorgehobenen Hinweis, sobald ihr persönliches Notfall-Postfach mindestens eine ungelesene Meldung enthält. Admins erhalten Hinweise für beide Notfallarten. Der Hinweis öffnet `/emergency`, wo die Meldung gelesen und als gelesen markiert werden kann; danach verschwindet er automatisch. Realtime, App-Rückkehr und ein gestaffelter Fallback-Refresh halten den Hinweis aktuell.

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
