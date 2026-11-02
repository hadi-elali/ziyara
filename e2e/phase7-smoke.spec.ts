import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  adminEmail,
  adminName,
  adminPassword,
  createE2EAdmin,
  createPublicTestClient,
  getLatestRecoveryRedirect,
  memberEmail,
  memberName,
  memberPassword,
  memberResetPassword,
  resetE2EAccounts,
} from './support/local-supabase';

async function login(page: Page, email: string, password: string, openHomeAfterLogin = true) {
  await page.goto('/login');
  await page.getByPlaceholder('name@beispiel.de').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  if (openHomeAfterLogin) await finishSignIn(page);
}

async function finishSignIn(page: Page) {
  const home = page.getByText('Städte (5)', { exact: true });
  const introContinue = page.getByRole('button', { name: 'Deutsch', exact: true })
    .or(page.getByRole('button', { name: 'Weiter', exact: true }));
  await expect(home.or(introContinue)).toBeVisible();
  if (!await home.isVisible()) await introContinue.click();
  await expect(page.getByText('Städte (5)', { exact: true })).toBeVisible();
  await dismissHomeTour(page);
}

async function dismissHomeTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Überspringen', exact: true });
  if (await skip.isVisible()) await skip.click();
}

async function continueIntro(page: Page) {
  await page.getByRole('button', { name: 'Deutsch', exact: true })
    .or(page.getByRole('button', { name: 'Weiter', exact: true })).click();
  await expect(page.getByRole('button', { name: 'Karbala', exact: true })).toBeVisible();
  await dismissHomeTour(page);
}

async function openHome(page: Page) {
  await page.goto('/');
  await continueIntro(page);
}

async function openAdmin(page: Page) {
  await openHome(page);
  await page.getByRole('button', { name: 'Adminbereich öffnen', exact: true }).click();
}

async function openAuthenticatedPage(
  browser: Browser,
  email: string,
  password: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  return { context, page };
}

test.describe.serial('Phase 7 E2E smoke flows', () => {
  test.beforeAll(async () => {
    await resetE2EAccounts();
    await createE2EAdmin();
  });

  test.afterAll(async () => {
    await resetE2EAccounts();
  });

  test('Ohne Anmeldung führen App-Routen ausschließlich zum Login', async ({ page }) => {
    for (const path of ['/', '/map', '/settings', '/onboarding', '/emergency', '/admin', '/_sitemap', '/unbekannt']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(page.locator('video')).toHaveCount(0);
      await expect(page.getByText('Städte (5)', { exact: true })).toHaveCount(0);
    }
  });

  test('Registrierung und Login', async ({ page }) => {
    await page.goto('/register');
    const [firstName, ...surname] = memberName.split(' ');
    await page.getByLabel('Vorname', { exact: true }).fill(firstName);
    await page.getByLabel('Nachname', { exact: true }).fill(surname.join(' '));
    await page.getByLabel('Geburtsdatum', { exact: true }).fill(`01.01.${new Date().getFullYear() - 32}`);
    await page.getByRole('radio', { name: 'Bruder' }).click();
    await page.getByRole('radio', { name: /Nur ich/u }).click();
    await page.getByPlaceholder('name@beispiel.de').fill(memberEmail);
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(memberPassword);
    await passwords.nth(1).fill(memberPassword);
    await page.getByRole('button', { name: 'Registrieren' }).click();
    await finishSignIn(page);

    await page.getByText('Einstellungen', { exact: true }).click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);

    await login(page, memberEmail, memberPassword);
  });

  test('Passwort-Reset über den Recovery-Link', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByPlaceholder('name@beispiel.de').fill(memberEmail);
    await page.getByRole('button', { name: 'Recovery-Link senden' }).click();
    await expect(page.getByText(/Wenn ein Konto für diese Adresse existiert/u)).toBeVisible();

    const appRedirect = new URL(await getLatestRecoveryRedirect(memberEmail));
    await page.goto(`/reset-password${appRedirect.search}${appRedirect.hash}`);
    await expect(page.getByText('Neues Passwort festlegen')).toBeVisible();
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(memberResetPassword);
    await passwords.nth(1).fill(memberResetPassword);
    await page.getByRole('button', { name: 'Passwort speichern' }).click();
    await expect(page.getByText('Passwort geändert')).toBeVisible();

    await login(page, memberEmail, memberResetPassword);
  });

  test('Intro öffnet Home per Weiter oder nach dem Videoende', async ({ page }) => {
    // The first intro and tour now follow a server-validated sign-in.
    await login(page, memberEmail, memberResetPassword, false);

    await expect(page.getByText('Sprache wählen', { exact: true })).toBeVisible();
    await expect(page.locator('video')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.getByTestId('home-feature-tour')).toBeVisible();
    await expect(page.getByText('1 von 6', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('2 von 6', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    for (let index = 0; index < 5; index += 1) {
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Los geht’s', exact: true }).click();
    await expect(page.getByTestId('home-feature-tour')).toHaveCount(0);
    await expect(page.getByText('Städte (5)', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Sprache wählen', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deutsch' })).toHaveCount(0);
    await expect(page.locator('video')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
    await page.locator('video').evaluate(video => video.dispatchEvent(new Event('ended')));
    await expect(page.getByRole('button', { name: 'Karbala' })).toBeVisible();
    await expect(page.getByTestId('home-feature-tour')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Suche' }).click();
    await expect(page.getByPlaceholder('Karbala, Ziyarah, Najaf suchen...')).toBeVisible();
    await page.getByRole('tab', { name: 'Merkliste' }).click();
    await expect(page.getByText('Noch keine Einträge')).toBeVisible();
    await page.getByRole('tab', { name: 'Einstellungen' }).click();
    await expect(page.getByText('Darstellung')).toBeVisible();
    await page.getByRole('button', { name: 'Einführung erneut ansehen' }).click();
    await expect(page.getByText('1 von 6', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Überspringen', exact: true }).click();
  });

  test('Gruppencheck von der Admin-Frage bis zur bestätigten Antwort', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await openAdmin(admin.page);
    await admin.page.getByRole('button', { name: /Statusabfrage/u }).click();
    await admin.page.getByLabel('Frage').fill('Sind alle E2E-Teilnehmenden da?');
    await admin.page.getByRole('button', { name: 'Frage stellen' }).click();
    await expect(admin.page.getByText('Sind alle E2E-Teilnehmenden da?')).toBeVisible();

    await openHome(admin.page);
    await admin.page.getByRole('button', { name: 'Statusabfrage beantworten', exact: true }).click();
    await admin.page.getByRole('button', { name: /Bestätigen/u }).click();
    await expect(admin.page.getByText('Deine Antwort wurde gespeichert.')).toBeVisible();
    await admin.page.getByRole('button', { name: /Zurück zur App/u }).click();
    await expect(admin.page).toHaveURL(/\/$/u);
    await openAdmin(admin.page);
    await admin.page.getByRole('button', { name: /Statusabfrage/u }).click();
    await admin.page.getByRole('button', { name: /^Ja: Namen anzeigen/u }).click();

    await openHome(member.page);
    await expect(member.page.getByText('Sind alle E2E-Teilnehmenden da?')).toBeVisible();
    await member.page.getByRole('button', { name: 'Bestätigen' }).click();
    await expect(member.page.getByText('Deine Antwort wurde gespeichert.')).toBeVisible();
    await expect(admin.page.getByText(memberName)).toBeVisible();

    await admin.page.getByRole('button', { name: 'Abfrage beenden und App freigeben' }).click();
    await expect(admin.page.getByRole('button', { name: 'Frage stellen' })).toBeVisible();
    await admin.context.close();
    await member.context.close();
  });

  test('anonyme Fragerunde von Freigabe bis Einreichung', async ({ browser }) => {
    const adminClient = createPublicTestClient();
    const adminSignIn = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    expect(adminSignIn.error).toBeNull();
    const openedRound = await adminClient.rpc('open_question_round', {
      p_target_member_type: 'brother',
    });
    expect(openedRound.error).toBeNull();
    expect(openedRound.data?.id).toBeTruthy();
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await expect(member.page.getByText('Die anonyme Fragerunde ist geöffnet')).toBeVisible();
    await member.page.getByRole('button', { name: 'Anonyme Frage stellen' }).click();
    await member.page.getByLabel('Deine Frage').fill('Ist dies eine lokale E2E-Testfrage?');
    await member.page.getByRole('button', { name: 'Frage anonym senden' }).click();
    await expect(member.page.getByText('Deine Frage wurde anonym gespeichert.')).toBeVisible();
    const savedQuestion = await adminClient
      .from('anonymous_questions')
      .select('id')
      .eq('round_id', openedRound.data?.id ?? 0)
      .eq('question', 'Ist dies eine lokale E2E-Testfrage?')
      .single();
    expect(savedQuestion.error).toBeNull();

    const closedRound = await adminClient.rpc('close_question_round', {
      p_round_id: openedRound.data?.id ?? 0,
    });
    expect(closedRound.error).toBeNull();
    await adminClient.auth.signOut();
    await member.context.close();
  });

  test('Bus selbst wählen, nach Neustart behalten und als Admin verschieben', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await openAdmin(admin.page);
    await admin.page.getByRole('button', { name: /Fahrten & Busse/u }).click();
    await admin.page.getByLabel('Name der Fahrt').fill('E2E Ziyara Reise');
    await admin.page.getByRole('button', { name: 'Fahrt anlegen', exact: true }).click();
    await expect(admin.page.getByText('E2E Ziyara Reise')).toBeVisible();
    for (const name of ['Bus 1', 'Bus 2']) {
      await admin.page.getByLabel('Busname').fill(name);
      await admin.page.getByRole('button', { name: 'Bus anlegen', exact: true }).click();
      await expect(admin.page.getByRole('button', { name: `${name} · 0 Konten`, exact: true })).toBeVisible();
    }

    await openHome(member.page);
    await member.page.getByRole('button', { name: 'Buszuordnung öffnen', exact: true }).click();
    await expect(member.page.getByText('E2E Ziyara Reise')).toBeVisible();
    await member.page.getByRole('button', { name: 'Bus 1 auswählen', exact: true }).click();
    await expect(member.page.getByText('Dein Bus: Bus 1', { exact: true })).toBeVisible();
    await member.page.reload();
    await continueIntro(member.page);
    await member.page.getByRole('button', { name: 'Buszuordnung öffnen', exact: true }).click();
    await expect(member.page.getByText('Dein Bus: Bus 1', { exact: true })).toBeVisible();

    const busOne = admin.page.getByRole('button', { name: 'Bus 1 · 1 Konten', exact: true });
    await expect(busOne).toBeVisible();
    await expect(admin.page.getByText(memberName, { exact: true })).not.toBeVisible();
    await busOne.click();
    await expect(admin.page.getByText(memberName, { exact: true })).toBeVisible();
    await admin.page.getByRole('button', { name: `${memberName} verschieben`, exact: true }).click();
    await admin.page.getByRole('button', { name: 'In Bus 2 verschieben', exact: true }).click();
    await expect(member.page.getByText('Dein Bus: Bus 2', { exact: true })).toBeVisible();

    await member.page.getByRole('button', { name: 'Zu Bus 1 wechseln', exact: true }).click();
    await expect(member.page.getByText('Dein Bus: Bus 1', { exact: true })).toBeVisible();
    await member.page.reload();
    await expect(member.page.getByText('Dein Bus: Bus 1', { exact: true })).toBeVisible();
    await admin.context.close();
    await member.context.close();
  });

  test('Tagesprogramm für mehrere Tage bis zur Home-Anzeige', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await openAdmin(admin.page);
    await admin.page.getByRole('button', { name: /Tagesprogramm/u }).click();
    await admin.page.getByLabel('Erster Tag (JJJJ-MM-TT)').fill(
      new Date().toLocaleDateString('sv-SE'),
    );
    await admin.page.getByRole('button', { name: 'Weiteren Tag hinzufügen' }).click();

    const titles = admin.page.getByLabel('Überschrift (optional)');
    const programs = admin.page.getByLabel('Programm');
    await expect(titles).toHaveCount(2);
    await titles.nth(0).fill('E2E Heute');
    await programs.nth(0).fill('08:00 Frühstück\n09:00 Abfahrt');
    await titles.nth(1).fill('E2E Morgen');
    await programs.nth(1).fill('10:00 Treffpunkt\n11:00 Weiterfahrt');
    await admin.page.getByRole('button', { name: '2 Tagesprogramme speichern' }).click();
    await expect(admin.page.getByText('Das Tagesprogramm wurde veröffentlicht.')).toBeVisible();

    await openHome(member.page);
    await expect(member.page.getByText('Tagesprogramm', { exact: true })).toBeVisible();
    await expect(member.page.getByText('Heute', { exact: true })).toBeVisible();
    await expect(member.page.getByText('E2E Heute', { exact: true })).toBeVisible();
    await member.page.getByRole('button', { name: 'Tagesprogramm öffnen' }).click();
    await expect(member.page.getByText('E2E Morgen', { exact: true })).toBeVisible();

    await member.page.route('**/rest/v1/daily_programs*', (route) =>
      route.abort('internetdisconnected'),
    );
    await openHome(member.page);
    await member.page.reload();
    await continueIntro(member.page);
    await expect(member.page.getByText('E2E Heute', { exact: true })).toBeVisible();
    await expect(
      member.page.getByText('Zuletzt gespeicherter Stand · Aktualisierung fehlgeschlagen'),
    ).toBeVisible();

    await admin.context.close();
    await member.context.close();
  });

  test('Reiseziel von Veröffentlichung bis zur Kartenliste', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await openAdmin(admin.page);
    await admin.page.getByRole('button', { name: /Reiseziele auf Karte markieren/u }).click();
    await admin.page.getByLabel('Name des Reiseziels').fill('E2E Tor 3');
    await admin.page.getByLabel('Breitengrad des Treffpunkts').fill('32.617');
    await admin.page.getByLabel('Längengrad des Treffpunkts').fill('44.033');
    await admin.page.getByRole('button', { name: /Reiseziel veröffentlichen$/u }).click();
    await expect(admin.page.getByText('„E2E Tor 3“ wurde auf der Karte veröffentlicht.')).toBeVisible();

    await openHome(member.page);
    await member.page.getByRole('tab', { name: 'Karte', exact: true }).click();
    await expect(member.page.getByRole('button', { name: 'Reiseziel: E2E Tor 3' })).toBeVisible();
    await member.page.getByRole('button', { name: 'Reiseziele', exact: true }).click();
    await expect(member.page.getByText('E2E Tor 3', { exact: true })).toBeVisible();

    await admin.context.close();
    await member.context.close();
  });

  test('Rollenänderung über die Admin-Oberfläche', async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await openAdmin(page);
    await page.getByRole('button', { name: /Benutzer Familienpakete/u }).click();
    await page.getByLabel('Personen oder Familien nach Namen suchen').fill(memberName);
    await expect(page.getByText(memberName)).toBeVisible();
    await page
      .getByRole('button', { name: `Details von ${memberName} anzeigen` })
      .click();
    await page.getByRole('button', { name: 'Rolle vergeben' }).click();
    await page.getByRole('radio', { name: 'Medizinisches Personal' }).click();
    await expect(page.getByText('Die Rolle wurde gespeichert.')).toBeVisible();

    const memberClient = createPublicTestClient();
    const signIn = await memberClient.auth.signInWithPassword({
      email: memberEmail,
      password: memberResetPassword,
    });
    expect(signIn.error).toBeNull();
    const profile = await memberClient
      .from('profiles')
      .select('role')
      .eq('user_id', signIn.data.user?.id ?? '')
      .single();
    expect(profile.error).toBeNull();
    expect(profile.data?.role).toBe('medical_staff');
    await memberClient.auth.signOut();
  });

  test('Admin löscht ein Konto und dessen geöffnete App kehrt zum Login zurück', async ({ browser }) => {
    test.setTimeout(90_000);
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    try {
      await openAdmin(admin.page);
      await admin.page.getByRole('button', { name: /Benutzer Familienpakete/u }).click();
      await admin.page.getByLabel('Personen oder Familien nach Namen suchen').fill(memberName);
      await admin.page.getByRole('button', { name: new RegExp(`^Details von ${memberName}`, 'u') }).click();
      await admin.page.getByRole('button', { name: 'Benutzer löschen', exact: true }).click();
      await admin.page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(member.page.getByText('Städte (5)', { exact: true })).toBeVisible();

      await admin.page.getByRole('button', { name: 'Benutzer löschen', exact: true }).click();
      await admin.page.getByRole('button', { name: 'Ja, Benutzer endgültig löschen', exact: true }).click();
      await expect(admin.page.getByText(`Das Konto von ${memberName} wurde gelöscht.`, { exact: true })).toBeVisible();
      await expect(member.page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(member.page.getByRole('tab')).toHaveCount(0);

      await member.page.reload();
      await expect(member.page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
      await member.page.goto('/map');
      await expect(member.page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
      await expect(member.page.getByRole('tab')).toHaveCount(0);

      const deletedClient = createPublicTestClient();
      const deniedLogin = await deletedClient.auth.signInWithPassword({
        email: memberEmail,
        password: memberResetPassword,
      });
      expect(deniedLogin.error).not.toBeNull();
      expect(deniedLogin.data.session).toBeNull();
    } finally {
      await admin.context.close();
      await member.context.close();
    }
  });
});
