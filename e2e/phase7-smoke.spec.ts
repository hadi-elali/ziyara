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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('name@beispiel.de').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText('Städte (5)', { exact: true })).toBeVisible();
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

  test('Registrierung und Login', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('Dein Name').fill(memberName);
    await page.getByRole('radio', { name: 'Bruder' }).click();
    await page.getByRole('radio', { name: /Nur ich/u }).click();
    await page.getByPlaceholder('name@beispiel.de').fill(memberEmail);
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(memberPassword);
    await passwords.nth(1).fill(memberPassword);
    await page.getByRole('button', { name: 'Registrieren' }).click();
    await expect(page.getByText('Städte (5)', { exact: true })).toBeVisible();

    await page.getByText('Einstellungen', { exact: true }).click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.getByText(/Für Konto- und Gruppenfunktionen ist eine Anmeldung erforderlich/u)).toBeVisible();

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

  test('Erststart führt per Sprache und Gastzugang in den öffentlichen Guide', async ({ page }) => {
    await page.route('http://127.0.0.1:54321/**', (route) => route.abort('internetdisconnected'));
    await page.goto('/');

    await expect(page.getByText('Sprache wählen', { exact: true })).toBeVisible();
    await expect(page.locator('video')).toBeVisible();
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.getByText('Konto erstellen', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ohne Konto fortfahren' }).click();
    await expect(page.getByText('Städte (5)', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Städte (5)', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Karbala' })).toBeVisible();
    await page.getByRole('tab', { name: 'Suche' }).click();
    await expect(page.getByPlaceholder('Karbala, Ziyarah, Najaf suchen...')).toBeVisible();
    await page.getByRole('tab', { name: 'Merkliste' }).click();
    await expect(page.getByText('Noch keine Einträge')).toBeVisible();
    await page.getByRole('tab', { name: 'Einstellungen' }).click();
    await expect(page.getByText('Darstellung')).toBeVisible();
  });

  test('Gruppencheck von der Admin-Frage bis zur bestätigten Antwort', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await admin.page.goto('/admin');
    await admin.page.getByRole('button', { name: /Statusabfrage/u }).click();
    await admin.page.getByLabel('Frage').fill('Sind alle E2E-Teilnehmenden da?');
    await admin.page.getByRole('button', { name: 'Frage stellen' }).click();
    await expect(admin.page.getByText('Sind alle E2E-Teilnehmenden da?')).toBeVisible();

    await admin.page.goto('/check-in');
    await admin.page.getByRole('button', { name: /Bestätigen/u }).click();
    await expect(admin.page.getByText('Deine Antwort wurde gespeichert.')).toBeVisible();
    await admin.page.getByRole('button', { name: /Zurück zur App/u }).click();
    await expect(admin.page).toHaveURL(/\/$/u);
    await admin.page.goto('/admin');
    await admin.page.getByRole('button', { name: /Statusabfrage/u }).click();

    await member.page.goto('/check-in');
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
    const openedRound = await adminClient.rpc('open_question_round');
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

  test('Busmanagement von Zuordnung bis Boarding-Bestätigung', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await admin.page.goto('/admin');
    await admin.page.getByRole('button', { name: /Reiseorganisation/u }).click();
    await admin.page.getByLabel('Reisename').fill('E2E Ziyara Reise');
    await admin.page.getByRole('button', { name: 'Reise anlegen' }).click();
    await expect(admin.page.getByText('E2E Ziyara Reise')).toBeVisible();

    await admin.page.getByLabel('Busname').fill('Bus 1');
    await admin.page.getByRole('button', { name: 'Bus hinzufügen' }).click();
    await admin.page.getByLabel('Teilnehmer-ID').fill('E2E01');
    await admin.page.getByRole('radio', { name: 'Bus 1' }).click();
    await admin.page
      .getByLabel('App-Konto verknüpfen (optional)')
      .fill(memberName);
    await admin.page.getByText(memberName, { exact: true }).last().click();
    await admin.page.getByRole('button', { name: 'Teilnehmer speichern' }).click();
    await expect(admin.page.getByText('E2E01')).toBeVisible();

    await admin.page.getByRole('radio', { name: /Live-Begleitung/u }).click();
    await admin.page.getByLabel('Alarmmeldung').fill('Abfahrt vom E2E Hotel');
    await admin.page
      .getByRole('button', { name: /Generalalarm einschalten$/u })
      .click();
    await expect(admin.page.getByText('Abfahrt vom E2E Hotel')).toBeVisible();

    await member.page.getByRole('button', { name: 'Busstatus öffnen' }).click();
    await expect(member.page.getByText('Abfahrt vom E2E Hotel')).toBeVisible();
    await expect(member.page.getByText('E2E01')).toBeVisible();
    await member.page.getByRole('button', { name: 'Gelesen' }).click();
    await member.page.getByRole('button', { name: 'Unterwegs' }).click();
    await member.page.getByRole('button', { name: 'Im Bus' }).click();
    await expect(member.page.getByText('Dein Busstatus wurde gespeichert.')).toBeVisible();
    await expect(admin.page.getByText('Im Bus').first()).toBeVisible();

    await admin.page
      .getByRole('button', { name: /Generalalarm beenden$/u })
      .click();
    await expect(
      admin.page.getByRole('button', { name: /Generalalarm einschalten$/u }),
    ).toBeVisible();
    await admin.context.close();
    await member.context.close();
  });

  test('Tagesprogramm für mehrere Tage bis zur Home-Anzeige', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await admin.page.goto('/admin');
    await admin.page.getByRole('button', { name: /Tagesprogramm/u }).click();
    await admin.page.getByRole('radio', { name: '2 Tage' }).click();

    const titles = admin.page.getByLabel('Überschrift (optional)');
    const programs = admin.page.getByLabel('Programm');
    await expect(titles).toHaveCount(2);
    await titles.nth(0).fill('E2E Heute');
    await programs.nth(0).fill('08:00 Frühstück\n09:00 Abfahrt');
    await titles.nth(1).fill('E2E Morgen');
    await programs.nth(1).fill('10:00 Treffpunkt\n11:00 Weiterfahrt');
    await admin.page.getByRole('button', { name: '2 Tagesprogramme speichern' }).click();
    await expect(admin.page.getByText('Das Tagesprogramm wurde veröffentlicht.')).toBeVisible();

    await member.page.goto('/');
    await expect(member.page.getByText('Tagesprogramm', { exact: true })).toBeVisible();
    await expect(member.page.getByText('Heute', { exact: true })).toBeVisible();
    await expect(member.page.getByText('E2E Heute', { exact: true })).toBeVisible();
    await member.page.getByRole('button', { name: 'Wochenprogramm öffnen' }).click();
    await expect(member.page.getByText('E2E Morgen', { exact: true })).toBeVisible();

    await member.page.route('**/rest/v1/daily_programs*', (route) =>
      route.abort('internetdisconnected'),
    );
    await member.page.goto('/');
    await member.page.reload();
    await expect(member.page.getByText('E2E Heute', { exact: true })).toBeVisible();
    await expect(
      member.page.getByText('Zuletzt gespeicherter Stand · Aktualisierung fehlgeschlagen'),
    ).toBeVisible();

    await admin.context.close();
    await member.context.close();
  });

  test('Reiseführung von Veröffentlichung bis Problemübernahme', async ({ browser }) => {
    const admin = await openAuthenticatedPage(browser, adminEmail, adminPassword);
    const member = await openAuthenticatedPage(browser, memberEmail, memberResetPassword);

    await admin.page.goto('/admin');
    await admin.page.getByRole('button', { name: /Reiseorganisation/u }).click();
    await admin.page.getByRole('radio', { name: /Live-Begleitung/u }).click();
    await admin.page.getByLabel('Aktueller Besuchsort').fill('E2E Besuchsort');
    await admin.page.getByLabel('Nächster Programmpunkt').fill('E2E Weiterfahrt');
    await admin.page.getByLabel('Treffpunkt', { exact: true }).fill('E2E Tor 3');
    await admin.page.getByLabel('Relevante Tür / Eingang').fill('Tür 3');
    await admin.page.getByLabel('Entfernungshinweis').fill('etwa 300 m');
    await admin.page.getByLabel('Beschreibung').fill('Organisatorischer E2E-Hinweis');
    await admin.page
      .getByRole('button', { name: 'Programmpunkt veröffentlichen' })
      .click();
    await expect(admin.page.getByText('Live veröffentlicht')).toBeVisible();

    await admin.page.getByRole('button', { name: /Reiseziele & Navigation/u }).click();
    await admin.page.getByLabel('Name des Reiseziels').fill('E2E Tor 3');
    await admin.page.getByLabel('Breitengrad des Treffpunkts').fill('32.617');
    await admin.page.getByLabel('Längengrad des Treffpunkts').fill('44.033');
    await admin.page.getByRole('button', { name: /Reiseziel veröffentlichen$/u }).click();
    await expect(admin.page.getByText('„E2E Tor 3“ wurde auf der Karte veröffentlicht.')).toBeVisible();
    await admin.page.getByRole('button', { name: /Reiseziele & Navigation/u }).click();

    await member.page.goto('/');
    await expect(member.page.getByText('Aktueller Programmpunkt')).toBeVisible();
    await member.page.getByRole('button', { name: 'Programmpunkt öffnen' }).click();
    await expect(member.page.getByText('E2E Besuchsort', { exact: true })).toBeVisible();
    await expect(member.page.getByText('E2E Tor 3', { exact: true }).last()).toBeVisible();

    await admin.page.getByLabel('Treffpunkt', { exact: true }).fill('E2E Tor 4');
    await admin.page.getByRole('button', { name: 'Änderungen live speichern' }).click();
    await expect(member.page.getByText('E2E Tor 4', { exact: true })).toBeVisible();

    await member.page.getByRole('radio', { name: 'Problem' }).click();
    await expect(member.page.getByText('Dein Status wurde übertragen.')).toBeVisible();
    await expect(admin.page.getByRole('button', { name: 'Problem übernehmen' })).toBeVisible();
    await admin.page.getByRole('button', { name: 'Problem übernehmen' }).click();
    await expect(
      member.page.getByText(`Deine Meldung wurde von ${adminName} gesehen.`),
    ).toBeVisible();

    await admin.context.close();
    await member.context.close();
  });

  test('Rollenänderung über die Admin-Oberfläche', async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.goto('/admin');
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
});
