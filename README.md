# Bestimmungs-Trainer

Lern-App für die Bestimmungsschlüssel (Dr. E. Weber, Uni Tübingen – BFT 2026):
Vögel, Säugerschädel, Insektenordnungen, Süßwasserfische.

## Aufbau
Startseite → Tiergruppe wählen → fünf Bereiche:

1. **📖 Schlüssel ansehen** – der komplette Schlüssel wie im Skript, Teilschlüssel oben als Reiter.
2. **🧠 Lernen: Merkmal → Tier** – die Merkmale eines Weges werden gezeigt, du nennst das Tier
   (Hilfen: Zwischengruppe zeigen, 4 Antworten zeigen, Auflösen). Ganzer Schlüssel oder einzelne Teilschlüssel.
3. **📷 Prüfung mit Auswahl** – echtes Foto (bei Säugern ein Schädel), du wählst bei jedem Schritt die
   zutreffende Alternative. Fehler werden sofort markiert.
4. **✍️ Prüfung schriftlich** – echtes Foto, du schreibst jedes Merkmal in eigenen Worten und jeden fett
   gedruckten Namen selbst. Die Eingabe wird grob (nicht wortwörtlich) mit den Alternativen verglichen.
   Tipps in Stufen (Alternativen → Anfang → Stichworte) und Aufdecken.
5. **★ Markierte Tiere** – mit ☆ markierte Tiere (im Schlüssel, beim Lernen, in beiden Prüfungen)
   landen hier und lassen sich in allen drei Übungen gezielt wiederholen.

Tiere, die noch nicht sicher sitzen, kommen öfter dran. Der Fortschritt wird nur im Browser des Geräts gespeichert.

## Fotos
Alle Fotos stammen von Wikimedia Commons (freie Lizenzen; Urheber & Lizenz werden nach jeder Bestimmung angezeigt)
und wurden einzeln auf die richtige Art geprüft. Säugerschädel stammen überwiegend aus beschrifteten Museumssammlungen
(Museum Wiesbaden, Muséum Toulouse, Naturalis Biodiversity Center). Zeichnungen und Bilder mit lesbarem
Artnamen wurden aussortiert. Ohne geprüftes Foto (nur im Lernmodus): Strepsiptera, Haselmaus,
Wasserspitzmaus, Zwergspitzmaus.

## Passwortschutz
Die Seite startet mit einer Passwortabfrage. Schlüsseltexte, Bildzuordnung und Merkmalsblatt liegen nur
verschlüsselt in `daten.enc.js` (AES-256, Schlüssel per PBKDF2 aus dem Passwort) und werden erst im Browser
mit dem richtigen Passwort entschlüsselt. Ohne Passwort sind sie auch beim direkten Abruf der Datei nicht lesbar.

## Veröffentlichen mit GitHub Pages
1. Auf github.com ein neues Repository anlegen (z. B. `bestimmungstrainer`).
2. Den **Inhalt dieses Ordners** hochladen (inkl. Ordner `img/`).
3. *Settings → Pages → Branch: `main` / `/ (root)` → Save.*
4. Nach ca. 1 Minute läuft die App unter `https://<benutzername>.github.io/bestimmungstrainer/` – auch am Handy.

Ohne Internet: `index.html` doppelt anklicken.
