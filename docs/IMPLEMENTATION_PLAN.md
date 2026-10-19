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

- Admins create one active intermediate trip within the overall pilgrimage and named buses; every newly created bus requires a registered leader.
- Admins assign either one registered person or an entire account family to a bus. After a family assignment, its members are not offered as individual choices.
- The active intermediate trip can be collapsed and ended. With none active, admins can start empty or copy buses, leaders and person/family assignments from an ended intermediate trip without copying boarding state.
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

## Phase 12: Trip destinations and navigation

Since 13 October 2026, the current itinerary point, its admin editor, Home entry, `/guide` route, participant reports, problem acknowledgements and offline outbox are removed from the client. Historical migrations, database types, tables and RPCs remain for existing data and older clients.

Files:

- `src/features/trip-guidance/*` (the historical folder/provider name now covers navigation destinations only)
- `src/app/admin.tsx`
- `src/features/map/*`
- `src/features/i18n/i18n.tsx`
- `supabase/migrations/20260828120000_add_trip_navigation_destinations.sql`
- `supabase/migrations/20261007000000_separate_navigation_from_intermediate_trips.sql`

Acceptance criteria:

- `Trips & buses` contains bus management and boarding without a current itinerary point.
- The admin dashboard exposes trip destinations and navigation as its own section. Admins create, edit and archive multiple named destinations without an active intermediate trip and select coordinates on a platform-specific map or through one foreground location request.
- Every signed-in account sees active destinations as distinct map markers, can open their list and use external navigation. Destinations remain visible when an intermediate trip ends or is deleted.
- A validated user-scoped destination cache survives restart and initial read failures; a successful server response, including an empty list, replaces it authoritatively.
- The client reads and subscribes only to navigation destinations in this provider. Realtime, focus and staggered fallback refreshes remain available without trip or participant reads.
- The independent daily program remains available on Home and `/program`.

Tests/checks:

- Existing destination-cache, provider, navigation, admin destination editor and public offline-start tests.
- TypeScript, lint, Expo dependency alignment, Expo Doctor and web export.
- No database migration or new native dependency is required for the client removal.

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

- Since 8 October 2026, the standalone `Wake-up call` dashboard section sends immediately or schedules multiple messages without a trip, bus or group dependency. As clarified on 14 October, date/time entry, editing and display use the sender's current device time zone, including the offset for the scheduled date. Scheduling still stores an absolute UTC instant; existing calls retain their activation time. Future calls can be edited or cancelled. The authenticated server scheduler activates due calls and captures recipients at activation. Users acknowledge once; admins see acknowledgement totals and close the call. The former departure alarm remains a separate boarding workflow under `Trips & buses`.
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
- `supabase/migrations/20260922000000_separate_daily_program_from_intermediate_trips.sql`
- `supabase/tests/database/daily_program.test.sql`
- `e2e/phase7-smoke.spec.ts`

Acceptance criteria:

- Admins can publish one day or prepare multiple consecutive days in one form, with an optional heading and a separate organizational program for each date.
- The daily program covers the complete pilgrimage and stays independent of the individual trips managed under Trips & buses.
- One row per calendar date is updated atomically through an authenticated admin RPC; direct client writes remain unavailable.
- Every signed-in account can read the whole-journey program without an active intermediate trip or bus assignment.
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

- Admin `Groups & group leaders` creates, edits and deletes independent account groups without requiring an intermediate trip or bus. Admins add individuals or whole account families; family expansion and conflict detection are atomic. One account belongs to at most one group.
- Group names can be a single character, including a digit or Arabic letter. A name is still required, trimmed and limited to 80 characters. Migration `20261015000000_allow_short_organization_group_names.sql` updates both the table constraint and admin RPC without changing existing rows or authorization. Verify create/rename, boundaries and permission checks locally before remote rollout.
- Every group has one or more registered leaders who are also members. Group leadership does not grant global admin access.
- Any app role, including an admin, can be a member or leader directly through its registered account. Admins see only their own assignments on Home and `/group`, while `/admin` retains the complete overview.
- Admins can request only a selected group leader’s location. Each leader sees only their own request; ordinary members cannot be targeted. Re-requesting creates a fresh request ID and clears previously shared coordinates.
- Only the addressed current leader sees and answers the request. The leader can decline without granting device permission or explicitly share one foreground location.
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

## 8 October 2026: Independent groups and wake-up calls

- Migration `20261008000000_independent_groups_and_wake_up_calls.sql` preserves legacy data and imports active group assignments without old location consent.
- `organization_group*` tables reference accounts directly. Family selections resolve current family accounts on save; later family edits do not silently change saved group memberships.
- The independent `wake_up_call*` tables persist recipients and acknowledgements. `dispatch-wake-up-call` verifies admin authorization and claims each registered device once. Notification taps open `/alarm`.
- The client retains boarding under `Fahrten & Busse`; its former alarm component is now `AdminBoardingPanel`.
- Validation is deliberately focused: TypeScript, lint, SDK checks, web export, existing group-state assertions and the new database authorization/lifecycle checks. No full coverage or end-to-end suite is required for this request.
- Migration is applied locally. Remote migration/function deployment and physical-device delivery verification remain pending.

### Scheduled wake-up calls

- `20261008010000_schedule_wake_up_calls.sql` adds absolute scheduled/activation timestamps, keeps existing calls and permits several planned or active calls. Normal users cannot see or acknowledge future calls.
- The existing minutely scheduler authenticates through `dispatch-general-alarm` and executes the shared wake-up dispatcher even without an active boarding or open app. No new secret or client background task is required.
- Due activation locks the same call row as edit/cancel operations. Cancelled and future calls are excluded. Each recipient/device is claimed once; accounts created after planning are included at activation.
- The admin form offers Now/Schedule, local device date/time (clarified on 14 October), an editable planned list and separate active calls. Nonexistent local times at a daylight-saving transition are rejected; repeated local times resolve to the first occurrence. The user panel acknowledges each active call independently.
- Only focused date/time, authorization and scheduling lifecycle checks are added. Both Functions must be deployed with the new migration; existing cron configuration must remain enabled.

## 13 October 2026: Scholar role and anonymous question management

- Add `scholar` to the app-role enum in its own migration before referencing it in the question-permissions migration. Admins assign it through the existing audited role RPC, preserving last-admin protection and the `user` signup default.
- Admins and scholars can read anonymous questions, check them off, and open or close rounds. Scope RLS and management RPCs through `can_manage_question_rounds`; preserve `is_admin` and all unrelated administrative boundaries.
- As clarified on 14 October, expose `/question-round-management` only in Settings for scholars, including when no round is open. Admins retain question management in the admin dashboard. Home has no management link. Retain the participant submission route, session/role guards and the normal non-admin mandatory-check flow.
- Preserve anonymous question rows, private submission counters, five-question limits and cleanup on closure. Provide German, English and Arabic role labels, management links and recipient explanations.
- Run required TypeScript, lint, SDK compatibility, Doctor and web-export checks plus focused role-authorization checks. No additional full coverage, E2E or device suite for this request.
- Both migrations are applied and tested locally; remote application and updated client delivery remain pending. No native configuration or dependency change requires a new development build.

## 15 October 2026: Clear group and trip labels

- Name the independent admin sections `Gruppen & Gruppenleitung` / `Groups & group leaders` and `Fahrten & Busse` / `Trips & buses`, with corresponding Arabic labels.
- Use the same trip terminology in creation, copy, archive, status and help text. Boarding instructions point directly to Trips & buses.
- Group editing, empty and deletion copy describes registered accounts and families without an active-trip prerequisite. Remove obsolete group/trip prerequisites from the dictionaries.
- Selected group leaders have a separate red X with a 44-point minimum touch target. Removing leadership requires confirmation on native and web; cancellation preserves the selection. The account remains selected as a member, and changes take effect when the group is saved. Leader search only adds leaders. Translate the confirmation and accessible button labels into all three languages.
- Preserve separate group memberships, leaders, bus assignments and bus leaders. Assigning an entire group to a bus remains a possible future feature.
- Update README, context, boarding documentation and existing E2E selectors. This copy change requires no route, backend, dependency or native configuration changes and no new development build.

## 19 October 2026: Complete and delete emergencies

- Follow-up layout: use neutral cards, a narrow unread accent, compact header metadata/status and one wrapping row for Read/Complete/Delete. Add an optional compact button size with 44-point minimum targets; keep the default size elsewhere. Preserve confirmation, pending/error states and role enforcement. Translate short action labels in all three languages; no additional tests for this reversible layout adjustment.
- Medical and organization staff can complete their own team's emergencies; admins can complete either type. Only admins can permanently delete open or completed emergencies, with confirmation on native and web. Enforce current profile roles and team scope in authenticated RPCs; direct writes remain unavailable.
- Migration `20261019000000_manage_emergency_requests.sql` adds a shared completion timestamp and nullable actor reference, extends both read RPCs and preserves existing visibility. Completion is idempotent under a row lock; deletion cascades to recipients and private push logs. Personal read receipts remain independent.
- Expose actions and status in both emergency inbox screens, show completion to senders and exclude completed emergencies from unread Home alerts. Provide translated pending/error states and Realtime/focus/fallback refreshes with stale-read invalidation after successful writes.
- Apply and verify locally with focused authorization/lifecycle and action tests plus the required TypeScript, lint, SDK, Doctor and web checks. Per user request, no additional full coverage, E2E or device suite. Remote migration and client delivery remain required; no new native dependency or development build is needed.
