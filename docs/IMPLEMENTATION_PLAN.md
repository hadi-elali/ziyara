# Shia Ziyarah Iraq Implementation Plan

This app is a production-ready mobile guide for Shia ziyarah in Iraq, built with Expo SDK 57, React Native, Expo Router, and TypeScript.

Religious-content rule: do not write unverified duas, ziyarat, Arabic text, transliteration, translation, hadith, devotional instructions, or religious claims. Use placeholders, source fields, and `needs_review` status until qualified review is complete.

## Phase 1: Architecture and project setup

Files to create or modify:

- `package.json`
- `package-lock.json`
- `app.json`
- `tsconfig.json`
- `AGENTS.md`
- `README.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `src/app/_layout.tsx`
- `src/constants/theme.ts`

Risks:

- SDK/package drift if dependencies are manually pinned instead of installed with `npx expo install`.
- Expo SDK 57 requires a supported Node engine range. Node `23.x` can trigger engine warnings even when commands run.
- App config changes for location and maps may require a new development build.

Acceptance criteria:

- Project uses Expo SDK 57-compatible packages.
- App name and config reflect `Shia Ziyarah Iraq`.
- Expo Router, TypeScript strict mode, and path aliases work.
- Repo instructions define conventions, review rules, test commands, and done criteria.

Tests/checks:

- `node -v`
- `npm install`
- `npx expo install --check`
- `npx tsc --noEmit`
- `npm run lint`
- `npx expo-doctor@latest`

## Phase 2: Data models and seed content structure

Files to create or modify:

- `src/domain/types.ts`
- `src/data/places.ts`
- `src/data/recommendedActs.ts`
- `src/data/religiousContent.ts`
- `src/data/sourceReferences.ts`
- `src/data/catalog.ts`
- Future: `src/data/contentReview.ts`
- Future: `src/data/candidatePlaces.ts`

Risks:

- Accidentally presenting unverified religious content as authoritative.
- Mixing UI copy with religious content, making review and replacement difficult.
- Coordinates, opening hours, accessibility notes, and historical notes may be inaccurate without source review.
- Conditional places, such as sites listed only if verified, should not be seeded as verified without sources.

Acceptance criteria:

- Strong TypeScript models exist for `Place`, `RecommendedAct`, `ReligiousContent`, `SourceReference`, and `VerificationStatus`.
- Seed content is local and offline-available.
- Religious content uses placeholder text and source/reference fields until reviewed.
- Every recommended act is either sourced or marked `needs_review`.
- Conditional places are omitted or clearly marked as candidates until verified.

Tests/checks:

- `npx tsc --noEmit`
- Unit tests for catalog lookup and search once test tooling is added.
- Manual audit: no fabricated Arabic, transliteration, translation, hadith, or devotional claims.
- Manual audit: each content item has `verificationStatus` and `sourceReferences`.

## Phase 3: Navigation and base UI

Files to create or modify:

- `src/app/_layout.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/map.tsx`
- `src/app/(tabs)/search.tsx`
- `src/app/(tabs)/bookmarks.tsx`
- `src/app/(tabs)/settings.tsx`
- `src/app/about.tsx`
- `src/app/sources.tsx`
- `src/app/disclaimer.tsx`
- `src/components/ui/*`
- `src/components/themed-text.tsx`
- `src/constants/theme.ts`

Risks:

- Tab and stack route conflicts if both root and grouped routes map to the same path.
- UI can become marketing-like instead of a usable app surface.
- Text may overflow in compact buttons, cards, or RTL contexts.
- Palette can become too one-note or fail contrast requirements.

Acceptance criteria:

- Main tabs exist: Home, Map, Search, Bookmarks, Settings.
- Stack screens exist: Place Detail, Reader, About, Sources, Disclaimer.
- Base UI includes accessible buttons, cards, sections, status badges, and light/dark themes.
- First screen is useful app functionality, not a landing page.
- Disclaimer is reachable from the UI.

Tests/checks:

- `npx tsc --noEmit`
- `npm run lint`
- Manual navigation through every route on iOS/Android/web.
- Screenshot review for mobile and desktop web widths.
- Accessibility checks for tap targets, labels, contrast, and dynamic text sizes.

## Phase 4: Map and place detail experience

Files to create or modify:

- `src/features/map/MapScreen.tsx`
- `src/features/map/MapScreen.web.tsx`
- `src/app/place/[slug].tsx`
- `src/features/places/openNavigation.ts`
- `app.json`
- `src/data/places.ts`
- `src/data/recommendedActs.ts`

Risks:

- iOS, Android, and web need separate map renderers: Apple Maps on iOS, locally bundled Leaflet/OpenStreetMap HTML hosted directly by `react-native-webview` on Android, and the schematic offline fallback on web.
- Location permission denial must not block place markers.
- Map tile availability can fail offline even though place data is offline.
- Native map/location changes require a development build, not just Expo Go in all cases.
- Navigation URLs vary by platform.

Acceptance criteria:

- iOS and Android maps show Iraq-centered markers for seeded places; Android is geographically bounded to Iraq and needs no paid map API key.
- Web shows a functional fallback map/list without importing native-only map modules.
- Users can request location, see denied-permission messaging, and still browse places.
- Tapping markers opens a preview with place name, city, description, details, navigation, and acts actions.
- Place detail shows metadata, recommended acts, visiting notes, accessibility notes, and review status.

Tests/checks:

- `npx tsc --noEmit`
- `npm run lint`
- Manual test: permission granted.
- Manual test: permission denied.
- Manual test: airplane/offline mode still shows local place data.
- Manual test: navigation URL opens correctly on iOS, Android, and web.

## Phase 5: Dua/Ziyarah reader

Files to create or modify:

- `src/app/reader/[slug].tsx`
- `src/data/religiousContent.ts`
- `src/features/reader/SegmentedReligiousText.tsx`
- `src/features/storage/useReaderPreferences.ts`
- `src/features/storage/useReadingPosition.ts`
- `src/components/ui/button.tsx`
- `src/constants/theme.ts`

Risks:

- Unverified religious text could accidentally be introduced.
- Arabic text layout may be wrong without RTL and typography checks.
- Copy/share can expose placeholder content without enough context.
- Reading-position saves can be too frequent and hurt performance.

Acceptance criteria:

- Reader shows title, type, review status, paragraph blocks, notes, and sources.
- Placeholder text is visibly used where verified content is unavailable.
- Every paragraph keeps Arabic, transliteration, and German translation in one structured record.
- Arabic uses RTL writing direction; all three text components have separate persistent font sizes and visibility switches.
- Reader display controls are collapsed behind a settings icon.
- Bookmark, copy, share, and reading-position persistence are implemented.
- Source references are shown or clearly marked pending review; the Reader does not link to an external full-text page.

Tests/checks:

- `npx tsc --noEmit`
- `npm run lint`
- Manual test: font size increase/decrease.
- Manual test: copy and share actions.
- Manual test: bookmark reader entry.
- Manual audit: no unverified religious content beyond approved placeholders.

## Phase 6: Search and bookmarks

Files to create or modify:

- `src/app/(tabs)/search.tsx`
- `src/app/(tabs)/bookmarks.tsx`
- `src/data/catalog.ts`
- `src/features/storage/useBookmarks.ts`
- Future: `src/features/search/searchIndex.ts`

Risks:

- Search may not normalize Arabic, English, and transliteration well enough.
- Bookmarks can become stale if slugs change.
- Search results for recommended acts need a route target even when content is pending.

Acceptance criteria:

- Search covers places, cities, content, and recommended acts.
- Search supports filters for all, places, content, and acts.
- Results include verification status.
- Bookmarks persist locally for places and content.
- Empty states are clear and useful.

Tests/checks:

- `npx tsc --noEmit`
- Unit tests for `searchCatalog` once test tooling is added.
- Manual test: search by city, alternative name, content type, and act type.
- Manual test: add, revisit, and clear bookmarks.

## Phase 7: Offline persistence

Files to create or modify:

- `src/features/storage/persistentState.ts`
- `src/features/storage/useBookmarks.ts`
- `src/features/storage/useReaderPreferences.ts`
- `src/features/storage/useReadingPosition.ts`
- Future: `src/features/storage/sqliteContentStore.ts`
- Future: `src/features/storage/contentMigrations.ts`
- `app.json`

Risks:

- AsyncStorage is enough for preferences/bookmarks, but larger reviewed content may need SQLite migrations.
- Persisted schema changes can break older installs.
- Offline map tiles are not guaranteed unless a tile strategy is added.

Acceptance criteria:

- Seeded places and placeholder religious content are bundled locally.
- Bookmarks, reader preferences, and reading positions persist locally.
- SQLite should only be added once structured content has a concrete schema and migration need.
- Offline UI states explain what is available without internet.

Tests/checks:

- `npx tsc --noEmit`
- Manual test: restart app and verify bookmarks/preferences remain.
- Manual test: offline mode with bundled data.
- Future migration tests for SQLite schema changes.

## Phase 8: i18n and RTL support

Files to create or modify:

- Future: `src/i18n/index.ts`
- Future: `src/i18n/locales/en.ts`
- Future: `src/i18n/locales/ar.ts`
- Future: `src/features/reader/ReaderTextBlock.tsx`
- `src/app/reader/[slug].tsx`
- `src/components/themed-text.tsx`
- `src/constants/theme.ts`

Risks:

- Arabic and English layout can conflict in mixed-direction text.
- Transliteration search needs normalization beyond simple lowercase matching.
- Font fallback may render Arabic poorly on some devices.
- App-wide RTL requires careful layout testing.

Acceptance criteria:

- Reader supports RTL Arabic text blocks.
- UI strings are ready to move out of components into locale files.
- Search strategy accounts for Arabic, English, and transliteration fields.
- Typography choices work for Arabic readability.

Tests/checks:

- Manual Arabic rendering review on iOS and Android.
- Manual dynamic type checks.
- Manual RTL layout pass once app-level locale switching is introduced.
- Future unit tests for search normalization.

## Phase 9: Testing and QA

Files to create or modify:

- `package.json` with the Expo-supported Jest preset
- `src/data/catalog.test.ts`
- `e2e/phase7-smoke.spec.ts`
- `playwright.config.ts`
- `src/features/errors/AppErrorBoundary.tsx`
- `.github/workflows/ci.yml`
- Existing app/data files as test coverage grows

Risks:

- Production behavior can regress without automated coverage.
- Native map/location behavior is hard to test only with unit tests.
- Religious content review needs human workflow checks in addition to automated checks.

Acceptance criteria:

- TypeScript and lint pass.
- Jest covers catalog logic, AuthContext, BusManagementContext, GroupCheckContext, QuestionRoundContext, persistent state, rendered route guards, offline provider startup and the global Error Boundary.
- Coverage gates require at least 50% global line coverage and 80% per auth/bus-management/group-check/question-round context.
- Seven local Playwright full-stack smokes cover registration/login, password recovery, the public offline guide, group check, question round, bus management and role changes.
- Unhandled React render errors show a local fallback without an external monitoring dependency.
- Manual QA checklist covers navigation, map, permissions, reader, search, bookmarks, offline behavior, dark mode, and accessibility.
- CI runs required checks before merging.

Tests/checks:

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run test:e2e` with local Supabase and Chrome.
- Manual device QA on iOS and Android.

## Phase 10: App-store readiness

Files to create or modify:

- `app.json`
- `assets/images/*`
- `eas.json`
- Future: `store/metadata/*`
- Future: `privacy-policy.md`
- Future: `support.md`
- Future: `src/app/privacy.tsx`

Risks:

- Current starter assets are not final brand assets.
- Location permission copy must be accurate and minimal.
- Privacy disclosures must match real data collection.
- App-store screenshots must not imply verified religious content that is still pending review.
- Native dependency changes require development and production rebuilds.

Acceptance criteria:

- Final app icon, adaptive icon, splash screen, and brand assets are in place.
- iOS and Android bundle identifiers are configured.
- Privacy policy, support URL, content disclaimer, and source policy are ready.
- EAS Build profiles exist for development, preview, and production.
- Store metadata accurately describes placeholder/review status where relevant.

Tests/checks:

- `npx expo-doctor@latest`
- `eas build --profile preview --platform ios`
- `eas build --profile preview --platform android`
- Manual app-store metadata review.
- Manual TestFlight/internal testing pass.

## Phase 11: Bus management

Files to create or modify:

- `src/app/bus.tsx`
- `src/app/admin.tsx`
- `src/features/bus-management/*`
- `src/app/admin.tsx`
- `src/domain/database.ts`
- `supabase/migrations/20260827000000_add_bus_management.sql`
- `supabase/migrations/20260906000000_redesign_bus_trip_assignments.sql`
- `supabase/tests/database/phase8_bus_management*.test.sql`
- `e2e/phase7-smoke.spec.ts`

Acceptance criteria:

- Admins create one active trip and named buses; every newly created bus requires a registered leader.
- Admins assign either one registered person or an entire account family to a bus. After a family assignment, its members are not offered as individual choices.
- The active trip can be collapsed and closed. With no active trip, admins can start empty or copy buses, leaders and person/family assignments from a closed trip without copying boarding state.
- Participant records keep an internal legacy key for relational compatibility, but the current workflow neither asks for nor displays that key.
- Participants report `on_way`, `boarded` or `problem` only for their account-backed assignment.
- Admins see not-confirmed participants and may set any participant status manually.
- Realtime, focus and fallback refreshes retain the latest optimistic state and ignore stale reads.
- An expired authenticated session is refreshed once before retrying a participant or admin status mutation; final errors refresh the authoritative state and remain actionable in the UI.
- Concurrent response and close operations produce a fully ordered result without post-close writes.
- The public offline guide remains independent from Supabase and the bus route remains session-protected.

Tests/checks:

- Jest context/state and protected-route tests.
- Fresh local migration rebuild, DB lint and pgTAP RLS/RPC/concurrency tests.
- Playwright full-stack smoke from trip creation through boarding confirmation and close.
- Web, iOS and Android JavaScript exports.

## Phase 12: Trip guidance and “Where are we?”

Files to create or modify:

- `src/app/guide.tsx`
- `src/features/trip-guidance/*`
- `src/app/admin.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/_layout.tsx`
- `src/domain/database.ts`
- `src/features/i18n/i18n.tsx`
- `supabase/migrations/20260827120000_add_trip_guidance.sql`
- `supabase/migrations/20260828120000_add_trip_navigation_destinations.sql`
- `supabase/tests/database/phase9_trip_guidance.test.sql`
- `e2e/phase7-smoke.spec.ts`

Acceptance criteria:

- An admin publishes one current itinerary point for the active trip with current place, next item, departure, meeting point, relevant gate, distance hint, description and actions.
- Meeting-point corrections update the current item in place; publishing a new item closes the old version and starts fresh participant reports.
- Assigned participants report `on_way`, `almost_there`, `at_meeting_point`, `problem`, `lost` or `medical_help` for their account-backed assignment.
- An admin explicitly accepts a problem report, and the participant sees the accepting leader’s captured display name.
- Place links, external meeting-point navigation and a one-shot distance check work without continuous tracking or backend location storage.
- The admin dashboard exposes trip destinations and navigation as its own section, separate from trip-guidance editing. Admins can create and edit multiple named destinations, place each on a platform-specific map, drag the native marker or use their current location, preview navigation and archive obsolete entries.
- Signed-in trip members see every active destination as a distinct marker on the native and web maps. A “Trip destinations” button exposes the full list on both platforms; native selections focus the corresponding marker, and every destination remains reachable through external navigation.
- The last successful destination list is cached locally with strict validation and a user ID. It remains visible after an app restart when the initial read fails, while a successful server response, including an empty list, replaces the cache authoritatively.
- Realtime, app focus and staggered fallback refreshes keep guidance and reports current.
- Clear network failures queue reports in a validated, user-scoped AsyncStorage outbox. Pending UI never claims the leader received the report, and retries remain idempotent.
- RLS exposes only the active trip to members, only linked participant reports to normal accounts and the complete overview to admins. All writes use authenticated RPCs.

Tests/checks:

- Jest state, outbox parsing, destination-cache restart, distance and protected-route tests.
- Fresh local migration, database lint and pgTAP RLS/RPC lifecycle tests.
- Playwright full-stack smoke from publication through a Realtime meeting-point edit and explicit problem acceptance.
- Web, iOS and Android JavaScript exports plus manual native location-permission review.

## Phase 13: General alarm and escalation

Files to create or modify:

- `src/app/bus.tsx`
- `src/features/bus-management/*`
- `src/features/general-alarm/*`
- `src/domain/database.ts`
- `src/features/i18n/i18n.tsx`
- `supabase/migrations/20260827130000_add_bus_boarding_read_status.sql`
- `supabase/migrations/20260827140000_add_general_alarm.sql`
- `supabase/migrations/20260827150000_enforce_general_alarm_status_order.sql`
- `supabase/functions/dispatch-general-alarm/*`
- `supabase/tests/database/phase10_general_alarm.test.sql`
- `docs/GENERAL_ALARM.md`

Acceptance criteria:

- The admin area exposes Generalalarm inside the shared `Trip organization` area under the distinct `Live support` step, separate from bus setup. An admin explicitly configures and enables it there, sees its active/inactive state and can end it there.
- Participants confirm `read`, `on_way` and `boarded` in sequence for their account-backed assignment; `problem` remains available as an exception path.
- A missing next stage becomes due after five minutes. Native clients reconcile bounded local reminders, while an idempotent server dispatcher claims at most one Expo push attempt per device, participant, stage and reminder window.
- Push tokens are never client-readable. Registration is profile-bound, dispatch requires a verified admin or scheduler secret, and privileged claims/completions are limited to `service_role`.
- The admin overview shows confirmed and missing totals, every outstanding participant, per-bus closure readiness, urgency near departure and an explicit manual escalation action.
- Expo ticket acceptance is not presented as guaranteed device delivery. UI and documentation preserve iOS, Android, Expo Go, user-setting and powered-off-device limitations.
- Web remains functional without importing the native notification module.

Tests/checks:

- Jest tests for stage order, reminder timing, bus closure summaries and dispatcher authorization/results.
- Fresh local migration, DB lint and pgTAP tests for token secrecy, grants, escalation, read acknowledgements and idempotent five-minute claims.
- Web/iOS/Android exports and a new native development build.
- Real-device push and weak-network test after EAS credentials, Remote migration, Edge Function and scheduler are explicitly deployed.

## Phase 14: Daily program

Files to create or modify:

- `src/features/daily-program/*`
- `src/app/admin.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/program.tsx`
- `src/app/_layout.tsx`
- `src/domain/database.ts`
- `src/features/i18n/i18n.tsx`
- `supabase/migrations/20260828130000_add_daily_program.sql`
- `supabase/tests/database/daily_program.test.sql`
- `e2e/phase7-smoke.spec.ts`

Acceptance criteria:

- Admins can publish one day or prepare multiple consecutive days in one form, with an optional heading and a separate organizational program for each date.
- One row per trip and calendar date is updated atomically through an authenticated admin RPC; direct client writes remain unavailable.
- Every signed-in account can read the active trip's programs even before it is assigned to a bus.
- Home shows a compact preview of today's program. Opening it shows today and the next six days in separate day sections with structured agenda lines.
- The last validated per-user program snapshot is available immediately after restart while the server refresh continues in the background; an empty successful response remains authoritative.
- Realtime, app focus and staggered fallback refreshes retain the last visible data during background read failures.
- Calendar helpers use local dates and reject invalid ISO dates without shifting a day through UTC conversion.
- German, English and Arabic UI copy plus loading, empty, validation and sync-error states are present.

Tests/checks:

- Jest context and local-date helper tests plus the public offline-provider test.
- Local migration, DB lint and pgTAP tests for anonymous denial, authenticated reads, admin-only batch writes and same-date updates.
- Playwright full-stack smoke for two-day admin publication through the signed-in Home display.
- TypeScript, lint, Expo Doctor and web export.

## Phase 15: Trip groups and consent-based leader location

Files to create or modify:

- `src/app/group.tsx`
- `src/app/admin.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/_layout.tsx`
- `src/features/trip-groups/*`
- `src/domain/database.ts`
- `src/features/i18n/i18n.tsx`
- `src/features/navigation/routes.ts`
- `supabase/migrations/20260830000000_add_trip_groups_and_location_requests.sql`
- `supabase/tests/database/trip_groups.test.sql`

Acceptance criteria:

- In the shared admin `Trip organization` area, admins create, edit and delete named subgroups from people assigned to the active trip. One person belongs to at most one subgroup.
- Every subgroup has exactly one registered leader who is also a member.
- Any app role, including an admin, can be a member or leader through its account-backed trip assignment. Admins see only their own assignments on Home and `/group`, while `/admin` retains the complete overview.
- Admins can issue one current location request to the group leader. Re-requesting clears previously shared coordinates.
- Only the current leader sees and answers the request. The leader can decline without granting device permission or explicitly share one foreground location.
- There is no background or continuous tracking. Shared coordinates are readable only by the leader and admins, expire from client access after fifteen minutes, and are removed when the group changes or is deleted.
- Group members can see their group and its member list but cannot read location requests or coordinates.
- Home highlights a pending request for the leader, and `/group` remains session-protected with a validated login return route.
- Realtime, app focus and a staggered fallback keep group state current. German, English and Arabic UI copy covers loading, empty, permission, decline, expiry and error states.

Tests/checks:

- Jest state, route and public offline-provider tests.
- Fresh local migration, DB lint and pgTAP tests for grants, role boundaries, unique membership, explicit sharing, overwrite and deletion.
- TypeScript, lint, Expo dependency alignment, Expo Doctor and web export.
- Manual iOS/Android checks for foreground permission grant/denial, Realtime delivery and fifteen-minute expiry on a signed build.

## Phase 16: Account families, luggage, and SIM-card counts

Files to create or modify:

- `src/features/account-families/*`
- `src/features/auth/*`
- `src/app/account.tsx`
- `src/app/admin.tsx`
- `src/domain/database.ts`
- `src/features/i18n/i18n.tsx`
- `supabase/migrations/20260830010000_add_account_families_and_luggage.sql`
- `supabase/migrations/20260902000000_add_profile_sim_card_count.sql`
- `supabase/tests/database/account_families_and_luggage.test.sql`
- `supabase/tests/database/profile_sim_card_count.test.sql`

Acceptance criteria:

- Registration requires a luggage count from `0` to `50`; the value covers every person represented by the account. Existing accounts default to `0`.
- Registration accepts a required SIM-card count from `0` to `50`; the value covers every person represented by the account. Existing accounts default to `0`.
- Signed-in users can update only their own luggage count from the account page reached through Settings.
- Signed-in users can update only their own SIM-card count from the account page reached through Settings.
- Admins can create, rename and delete named account families and assign registered user accounts to them.
- One account belongs to at most one account family. Assigning it elsewhere moves it atomically, while deleting a family preserves the accounts and clears their assignment.
- Account families remain separate from `party_size` and trip groups and can be selected as one bus-assignment unit.
- Direct family writes remain unavailable to clients. Minimal authenticated admin RPCs handle management, and RLS lets members read only their own family name without exposing other memberships.
- German, English and Arabic UI copy includes loading, validation, empty, move, success and error states.
- The admin people overview shows registered accounts, represented people, brother/sister account counts, legacy accounts without a member type, created families, total suitcases and total SIM cards. Per-account details show member type and SIM-card count.

Tests/checks:

- Jest tests for luggage and SIM-card parsing, registration metadata, own-account updates and admin summary totals.
- Additive local migration, DB lint and pgTAP tests for grants, RLS, admin-only family management, atomic moves and deletion.
- TypeScript, lint, coverage validation, Expo Doctor and web export.
- Manual iOS/Android/Web checks for registration, account updates, family moves, small widths, themes, languages and dynamic text.

## Phase 17: First-run video and language onboarding

Files to create or modify:

- `src/app/onboarding.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/_layout.tsx`
- `src/features/onboarding/*`
- `src/features/auth/AuthFormScreen.tsx`
- `src/features/i18n/i18n.tsx`
- `src/features/navigation/routes.ts`
- `assets/videos/*`

Acceptance criteria:

- A fresh installation opens a locally bundled introduction video with German, English and Arabic language choices.
- Choosing a language persists the selection and opens registration in that language without replaying onboarding on later starts.
- Registration offers account creation, sign-in for existing accounts and an explicit guest path into the public offline guide.
- A video playback failure never blocks the language selection.
- Login and password-recovery deep links remain public and usable independently of the first-run tab gate.

Tests/checks:

- Jest tests for the validated onboarding state and navigation decision.
- Playwright smoke from first start through language selection, registration screen, guest entry and reload persistence.
- TypeScript, lint, Expo dependency alignment, Expo Doctor and web export.
- Manual iOS/Android/Web checks for fullscreen cropping, muted autoplay, small widths, themes, languages and Arabic text direction.
