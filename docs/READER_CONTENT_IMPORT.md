# Lesetexte importieren

## Eingabe und Vorschau

Unter **Admin → Lesetexte → Neuen Text anlegen** Titel und Stadt/Orte angeben; ein Quellenlink ist optional. Eine Unterscheidung nach Ziyara, Dua, Salawat oder anderen Inhaltsarten gibt es in der Oberfläche nicht. Ein Text kann mehreren Orten und Städten zugeordnet werden. Die Stadtauswahl schränkt lediglich die angezeigten Orte ein; sie entfernt keine bereits ausgewählten Orte.

Den vollständigen Quelltext unverändert in **Vollständigen Text einfügen** kopieren. **Vorschau erstellen** ist optional: Beim ersten **Entwurf speichern** oder **Veröffentlichen** werden die Abschnitte automatisch erstellt. Arabisch, Transliteration und Englisch stehen jeweils in einer neuen Zeile; zusätzliche Markierungen oder Trennzeichen sind nicht nötig. Beispiel mit ausschließlich synthetischen Daten:

```text
نص تجريبي أول

latin sample one
English sample one

نص تجريبي ثان

latin sample two
English sample two
```

- Aufeinanderfolgende arabische Zeilen bilden den arabischen Text. Die direkt folgende lateinische Zeile wird zur Transliteration, die danach folgenden Zeilen zur englischen Übersetzung. Die nächste arabische Zeile beginnt einen neuen Abschnitt. Leerzeilen zwischen den Abschnitten sind optional; innerhalb einer unformatierten Dreierfolge stehen die Komponenten direkt untereinander.
- Bestehende Markdown-Quellen mit `*Transliteration*` bleiben unterstützt; dort kann Englisch auch direkt hinter dem schließenden Sternchen stehen. Echte Zeilenumbrüche, CRLF, `<br>` und numerische HTML-Zeichenreferenzen werden weiterhin verarbeitet. `######` vor einer markierten Transliteration gilt als Formatierung der Quelle. Andere Markdown-Überschriften werden zu Überschriftblöcken; `>` erzeugt Hinweise.
- Der Import übersetzt und ergänzt keine Inhalte. Nicht eindeutig zuordenbare Zeilen werden vollständig als vorläufige Hinweise übernommen und mit **Zuordnung prüfen** markiert. Fehlende Transliteration sowie unvollständige unformatierte Dreierfolgen werden ebenfalls markiert. Die ausdrückliche Auswahl von **Einleitung**, **Hinweis** oder **Überschrift** unter **Bearbeiten** bestätigt die Zuordnung dieses Abschnitts. Alternativ kann **Zuordnung geprüft** bestätigt werden.
- **Einleitung ergänzen**, **Textabschnitt ergänzen** und **Hinweis danach einfügen** erstellen zusätzliche Blöcke. Unter **Bearbeiten** können Blockart, alle vier Textkomponenten, Reihenfolge sowie Fett/Kursiv geändert werden. Einleitungen und Hinweise können ausschließlich aus übersetztem Text bestehen. Leere Blöcke vor dem Speichern ausfüllen oder entfernen.
- Eingabetext und Vorschau lassen sich unabhängig ein- und ausklappen; alle Eingaben und Abschnittsbearbeitungen bleiben dabei erhalten. Speichern ist auch bei eingeklappten Bereichen möglich. Die Vorschau zeigt zehn Blöcke pro Seite. Weitere Blöcke sind über **Weitere Abschnitte** erreichbar.
- Sobald eine Vorschau oder manuelle Abschnitte existieren, speichern **Entwurf speichern** und **Veröffentlichen** genau die bearbeiteten Abschnitte. Auch spätere Änderungen der Originaleingabe lösen keinen neuen Import aus. Nur **Abschnitte neu erstellen** liest die Eingabe nach ausdrücklicher Bestätigung neu ein und ersetzt bisherige Bearbeitungen. Gelöschte Abschnitte werden beim Speichern ebenfalls nicht automatisch wiederhergestellt. Offene Zuordnungen werden bei einem Veröffentlichungsversuch mit einer konkreten Meldung und der passenden Vorschauseite angezeigt; bestehende Änderungen bleiben erhalten.

Deutsche Übersetzungen werden direkt im jeweiligen Abschnitt unter **Bearbeiten → Deutsch** ergänzt. Ein separates deutsches Volltextfeld und eine automatische Absatzzuordnung gibt es im Editor nicht mehr.

## Speichern und Veröffentlichung

**Entwurf speichern** speichert Metadaten, Originaleingaben, noch unklare Blocknummern und bearbeitete Blöcke gemeinsam auf dem Server. Die Daten stehen Admins nach erneutem Öffnen oder App-Neustart zur Verfügung. Der Linkname ist nach dem ersten Speichern unveränderlich, damit Lesezeichen gültig bleiben. Nach erfolgreichem Speichern oder Veröffentlichen erscheint ein leeres Formular mit neuer interner Kennung für den nächsten Text; Titel, Orte, Quellenlink und Text werden zurückgesetzt, die Tastatur geschlossen und die Seite nach oben gescrollt. Bei Validierungs- oder Speicherfehlern bleiben die Eingaben erhalten und können erneut gespeichert werden.

Punkte und Klammern im Titel sind erlaubt; beispielsweise bleibt ein Zusatz `(as.)` erhalten. Der automatisch erzeugte Linkname verwendet dagegen Kleinbuchstaben, Ziffern und Bindestriche. Speicherfehler benennen die konkrete fehlende oder ungültige Angabe, etwa einen nicht ausgewählten Ort (die Stadt allein reicht nicht) oder einen leeren Abschnitt mit seiner Nummer. Ein vorheriger Klick auf **Vorschau erstellen** ist keine Speicherbedingung mehr. Eingabeänderungen löschen veraltete Meldungen. Automatischer Erstimport, Erhalt bearbeiteter Einleitungen/Hinweise und akzeptierter Zuordnungen, Klappbereiche, Formularreset und Fehlerwiederholung sind mit 52 gezielten Editor-/Validierungs-/Importtests, TypeScript, Lint (nur der bestehende Home-Hinweis) und Diffprüfung abgedeckt; praktische Geräteprüfung steht aus.

**Veröffentlichen** stellt den Text den Lesern bereit, sobald die markierten Abschnittszuordnungen geklärt sind. Zusätzliche Schalter für Inhalts- oder Rechteprüfung gibt es nicht. Speichern und Veröffentlichen erzeugen daher keinen Prüfnachweis: Importierte Texte bleiben `needs_review` / `pending_rights_review`, ohne `reviewed_by` oder `reviewed_at`. Auch Prüf-Flags älterer Clients werden ignoriert. Leser sehen den tatsächlichen Status „Zu prüfen“ in Suche und Merkliste. In der Leseansicht sowie auf der Ortsseite bei Lesetexten und empfohlenen Handlungen werden auf Nutzerwunsch keine Prüfstatus-Kennzeichnungen angezeigt.

Der Editor enthält keinen zusätzlichen Knopf „Zur Textübersicht“, keinen Quellentitel, keine Quellen-/Inhaltshinweise, keinen deutschen Volltextimport und keine Prüf-Schalter. Über den normalen Zurück-Knopf lässt sich die Seite verlassen; ungespeicherte Änderungen bleiben vor versehentlichem Verlassen geschützt. Bereits gespeicherte Quellenangaben, Hinweise und deutsche Originaleingaben bleiben bei einer Bearbeitung erhalten. Ein fehlender Quellenlink wird nicht durch eine erfundene Quelle ersetzt; die Daten führen dann `editorial-review-required` als offenen Quellenhinweis, und die Quellenansicht zeigt fehlende Quellen an.

Veröffentlichte Importe erscheinen auf allen zugeordneten Ortsseiten gemeinsam mit den bestehenden Einträgen unter **Empfohlene Handlungen**, außerdem in der Suche und in der Merkliste. Eine separate Rubrik „Lesetexte zu diesem Ort“ gibt es nicht. Die Suche berücksichtigt Titel, Orts-/Stadtnamen, Quellen und bereits geladene Textkomponenten. **Als Entwurf zurücknehmen** entfernt den Eintrag aus dem Online-Katalog. Bestehende gebündelte Inhalte wie Ziyarat Ashura werden weiter über die Quelldateien verwaltet und erscheinen nicht als bearbeitbare Importe.

Der Reader bietet unter Anzeigeeinstellungen Deutsch, Englisch oder beide Übersetzungen an. Fehlt die ausgewählte Übersetzung, wird die vorhandene mit DE-/EN-Kennzeichnung angezeigt. Arabisch, Transliteration und Übersetzung behalten getrennte Sichtbarkeit und Schriftgrößen. Kopieren berücksichtigt die sichtbaren Komponenten. Bereits verwendete Backticks in Transliterationen bleiben Aussprachezeichen und werden nicht als Codeformatierung interpretiert.

## Speicherung und Zugriff

- `religious_contents`: zusätzliche `place_ids`, `source_title`, `source_url`, `is_imported`. Das Importkennzeichen ersetzt die bisherige Abhängigkeit von einem ausgefüllten Quellentitel. Vorhandene Einträge werden über ihre privaten Originalimporte zugeordnet.
- `religious_text_paragraphs`: zusätzlich `translation_en` und `block_kind` (`text`, `introduction`, `heading`, `note`); alle Komponenten bleiben in derselben geordneten Zeile.
- `religious_content_imports`: private Originaleingaben und offene Zuordnungen, ausschließlich für Admins lesbar.
- `admin_save_reader_content`: einzige neue Schreibschnittstelle. Prüft Adminrolle, Inhalt, offene Abschnittszuordnungen und den erwarteten `updated_at`-Stand; ersetzt Metadaten, Blöcke und Originale atomar. Abgelehnte Änderungen erhalten den bisherigen Stand. Direkte Tabellen-Schreibrechte bleiben entzogen.
- Leser erhalten veröffentlichte importierte Texte auch mit offenem Prüfstatus; die bisherigen Regeln für geprüfte gebündelte Inhalte gelten weiter. Nicht veröffentlichte Entwürfe bleiben ausschließlich für Admins sichtbar. Originalimporte werden auch nach Veröffentlichung nicht für Leser freigegeben. Zurückgewiesene Einträge bleiben gesperrt.
- `ziyara.published-reader.v1`: gemeinsamer validierter Snapshot `{ contents, hasCatalogSnapshot }` ausschließlich für veröffentlichte Metadaten und bereits geöffnete Volltexte. Frühere Array-Caches werden automatisch übernommen. Der gespeicherte Bereitschaftsstatus gilt auch für bestätigte leere Ergebnisse. Erfolgreiche Katalogabgleiche entfernen zurückgenommene Einträge und invalidieren geänderte Volltexte. Ohne Netzwerk bleibt der letzte bestätigte veröffentlichte Stand verfügbar. Noch nie geladene Volltexte benötigen eine Verbindung. Keine Entwürfe oder Originalimporte im lokalen Cache.

Beim Zurückkehren zu einem Ort werden bekannte Daten im Hintergrund aktualisiert. Dabei erscheint kein neuer Initial-Ladeindikator. Bereits sichtbare gebündelte Handlungen benötigen ebenfalls keinen Katalog-Spinner. Der erste echte Abruf ohne verfügbare Inhalte zeigt nach der lokalen Cacheprüfung weiterhin einen Ladeindikator.

Diese Navigationskorrektur ist durch 20 gezielte Katalog-/Ortskarten-/Reader-/Persistenztests, TypeScript, Diffprüfung und iOS-/Android-Exporte geprüft. Lint enthält nur den bestehenden Home-AsyncStorage-Hinweis; der lokale Expo-Abgleich besteht mit Offline-Hinweis. Eine praktische Geräteprüfung steht aus.

## Bereitstellung und Prüfungen

1. `20261113000000_reader_content_import.sql` und anschließend `20261113010000_simplify_reader_content_editor.sql` vor dem aktualisierten Client auf das Zielprojekt anwenden. Die Migrationen wurden bislang ausschließlich in zurückgerollten lokalen Testtransaktionen geprüft; keine Remote-Bereitstellung.
2. `react-native-enriched-markdown` 1.2.0 von Software Mansion ist in Manifest und Lockfile eingebunden. Vorschau und Reader verwenden `EnrichedMarkdownText`, die Abschnittsbearbeitung `EnrichedMarkdownTextInput`. Codehervorhebung, Mathematik und Video sind in `package.json` deaktiviert.
3. **Neuen nativen Development-/Release-Build erstellen.** Ein JavaScript-/OTA-Update allein ergänzt die nativen Komponenten nicht. Noch kein nativer Build und keine Prüfung auf Geräten. Native Tastatur, RTL, Schriftgrößen und Auswahl-/Formatierungswerkzeuge auf iOS und Android praktisch prüfen.

Prüfstand: 43 gezielte Jest-Tests in fünf Suites, 56 pgTAP-Assertions in zwei vollständig zurückgerollten lokalen Testtransaktionen, TypeScript, Diffprüfung und iOS-/Android-Exporte bestehen. Lint hat nur den bekannten Home-AsyncStorage-Hinweis; der lokale Expo-Paketabgleich besteht mit Offline-Hinweis. Keine zusätzliche Doctor-/Browser-/Geräteprüfung und kein nativer Build für diese Änderung; Paketstand unverändert.

Die Tests prüfen den reduzierten Editor, vollständigen Klartextimport, Speichern/Veröffentlichen ohne Quellentitel oder Prüf-Schalter, Erhalt älterer Metadaten und deutscher Fassungen, tatsächliche Prüfstatus im Reader/Cache sowie Berechtigungen und Atomarität. Datenbanktests nutzen ausschließlich synthetische Inhalte. Es wurden keine religiösen Volltexte neu aufgenommen oder als geprüft bestätigt. Native Geräteprüfung und Remote-Bereitstellung stehen aus.

Bibliothek und SDK: [Software Mansion](https://github.com/software-mansion/enriched-markdown/tree/main/packages/react-native-enriched-markdown), [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
